import { createHash, randomBytes } from 'node:crypto'
import { createService } from '@owlmeans/context'
import type { RedisResource } from '@owlmeans/redis-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import { appendContextual } from '@owlmeans/context'
import { OtpUnavailable } from './errors.js'
import type { AuthThrottleService, OtpConfig, OtpContext, ThrottleDecision, ThrottleRule } from './types.js'
import { OTP_RESOURCE, OTP_THROTTLE_SERVICE } from './consts.js'

type Clock = () => number

const digestKey = (kind: string, value: string): string =>
  createHash('sha256').update(`owlmeans:throttle:${kind}\0${value}`).digest('hex')

/** Collision-resistant, non-raw key for case-insensitive email throttles. */
export const emailThrottleKey = (email: string): string =>
  `email:${digestKey('email', email.trim().toLowerCase())}`

/** Non-raw key for request-source throttles. Callers remain responsible for trusted-proxy parsing. */
export const ipThrottleKey = (ip: string): string =>
  `ip:${digestKey('ip', ip.trim().toLowerCase())}`

const assertRules = (rules: readonly ThrottleRule[]): void => {
  if (rules.length === 0 || rules.some(rule => !Number.isInteger(rule.limit) || rule.limit < 1
    || !Number.isInteger(rule.windowSeconds) || rule.windowSeconds < 1)) {
    throw new SyntaxError('auth-otp throttle rules require positive integer limits and windows')
  }
}

/** Real in-memory implementation for single-process development and deterministic unit tests. */
export const makeMemoryThrottleService = (
  alias = OTP_THROTTLE_SERVICE, now: Clock = Date.now
): AuthThrottleService => {
  const events = new Map<string, number[]>()

  return createService<AuthThrottleService>(alias, {
    consume: async (key, rules): Promise<ThrottleDecision> => {
      assertRules(rules)
      const at = now()
      let retryAfter = 0
      const active = rules.map(rule => {
        const bucket = `${key}:${rule.limit}:${rule.windowSeconds}`
        const threshold = at - rule.windowSeconds * 1000
        const values = (events.get(bucket) ?? []).filter(value => value > threshold)
        events.set(bucket, values)
        if (values.length >= rule.limit) {
          retryAfter = Math.max(retryAfter, Math.ceil((values[0] + rule.windowSeconds * 1000 - at) / 1000))
        }
        return { bucket, values }
      })

      if (retryAfter > 0) return { allowed: false, retryAfter }
      active.forEach(({ bucket, values }) => events.set(bucket, [...values, at]))

      return { allowed: true, retryAfter: 0 }
    },
  })
}

interface ThrottleResourceRecord extends ResourceRecord { id: string }

const REDIS_THROTTLE_SCRIPT = `
local time = redis.call('TIME')
local now = tonumber(time[1]) * 1000 + math.floor(tonumber(time[2]) / 1000)
local retry = 0
for index = 1, #KEYS do
  local offset = (index - 1) * 2
  local limit = tonumber(ARGV[offset + 1])
  local window = tonumber(ARGV[offset + 2])
  redis.call('ZREMRANGEBYSCORE', KEYS[index], '-inf', now - window)
  local count = redis.call('ZCARD', KEYS[index])
  if count >= limit then
    local oldest = redis.call('ZRANGE', KEYS[index], 0, 0, 'WITHSCORES')
    if #oldest == 2 then
      retry = math.max(retry, math.ceil((tonumber(oldest[2]) + window - now) / 1000))
    end
  end
end
if retry > 0 then return {0, retry} end
local token = ARGV[#KEYS * 2 + 1]
for index = 1, #KEYS do
  local window = tonumber(ARGV[(index - 1) * 2 + 2])
  redis.call('ZADD', KEYS[index], now, token .. ':' .. index)
  redis.call('PEXPIRE', KEYS[index], window)
end
return {1, 0}
`

/** Redis implementation: every configured window is checked and consumed in one Lua operation. */
export const makeRedisThrottleService = (
  alias = OTP_THROTTLE_SERVICE, resourceAlias = OTP_RESOURCE
): AuthThrottleService => {
  const service = appendContextual<AuthThrottleService>(alias, {
    consume: async (key, rules, token): Promise<ThrottleDecision> => {
      assertRules(rules)
      const ctx = service.ctx as OtpContext<OtpConfig>
      const resource = ctx.resource<RedisResource<ThrottleResourceRecord>>(resourceAlias)
      // The shared hash tag keeps all windows in one Redis Cluster slot, which EVAL requires.
      const keys = rules.map(rule => resource.key(
        `throttle:{${key}}:${rule.limit}:${rule.windowSeconds}`
      ))
      const args = rules.flatMap(rule => [String(rule.limit), String(rule.windowSeconds * 1000)])
      args.push(token ?? randomBytes(16).toString('hex'))

      try {
        const result = await resource.db.client.eval(
          REDIS_THROTTLE_SCRIPT, keys.length, ...keys, ...args
        ) as [number, number]

        return { allowed: Number(result[0]) === 1, retryAfter: Number(result[1]) }
      } catch (error) {
        const unavailable = new OtpUnavailable('throttle')
        if (error instanceof Error) unavailable.oiriginalStack = `${error}: ${error.stack}`
        throw unavailable
      }
    },
  })

  return service
}
