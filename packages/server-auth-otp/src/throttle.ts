import { randomBytes } from 'node:crypto'
import { createService, appendContextual } from '@owlmeans/context'
import type { RedisResource } from '@owlmeans/redis-resource'
import { OtpUnavailable } from './errors.js'
import type { AuthThrottleService, OtpConfig, OtpContext, ThrottleDecision, ThrottleRule } from './types.js'
import { OTP_RESOURCE, OTP_THROTTLE_SERVICE } from './consts.js'
import { REDIS_THROTTLE_SCRIPT } from './consts.local.js'
import type { Clock, ThrottleResourceRecord } from './types.local.js'
import { throttleKeyHelper } from './throttle-keys.js'

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

/** @deprecated compat:factory-refactor — use `throttleKeyHelper.emailThrottleKey(…)` */
export const emailThrottleKey = (email: string): string => throttleKeyHelper.emailThrottleKey(email)

/** @deprecated compat:factory-refactor — use `throttleKeyHelper.ipThrottleKey(…)` */
export const ipThrottleKey = (ip: string): string => throttleKeyHelper.ipThrottleKey(ip)
