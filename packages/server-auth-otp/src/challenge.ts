import { appendContextual, createService } from '@owlmeans/context'
import type { RedisResource } from '@owlmeans/redis-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import { OtpUnavailable } from './errors.js'
import { OTP_CHALLENGE_STORE, OTP_RESOURCE } from './consts.js'
import type {
  OtpChallenge, OtpChallengeOutcome, OtpChallengeStore, OtpConfig, OtpContext,
} from './types.js'
import { OtpChallengeOutcome as Outcome } from './types.js'

type Clock = () => number
type StoredChallenge = OtpChallenge & { failedAttempts: number, expiresAt: number }

/** Real in-memory challenge store with synchronous consume/update semantics. */
export const makeMemoryOtpChallengeStore = (
  alias = OTP_CHALLENGE_STORE, now: Clock = Date.now
): OtpChallengeStore => {
  const records = new Map<string, StoredChallenge>()

  return createService<OtpChallengeStore>(alias, {
    issue: async (challenge, ttlSeconds): Promise<boolean> => {
      const current = records.get(challenge.id)
      if (current != null && current.expiresAt > now()) return false
      records.set(challenge.id, {
        ...challenge, failedAttempts: 0, expiresAt: now() + ttlSeconds * 1000,
      })
      return true
    },
    verify: async (id, emailKey, codeHash, maxFailedAttempts): Promise<OtpChallengeOutcome> => {
      const record = records.get(id)
      if (record == null || record.expiresAt <= now()) {
        records.delete(id)
        return Outcome.Missing
      }
      if (record.emailKey === emailKey && record.codeHash === codeHash) {
        records.delete(id)
        return Outcome.Verified
      }
      record.failedAttempts += 1
      if (record.failedAttempts >= maxFailedAttempts) {
        records.delete(id)
        return Outcome.Exhausted
      }

      return Outcome.Invalid
    },
  })
}

interface ChallengeResourceRecord extends ResourceRecord { id: string }

const REDIS_VERIFY_SCRIPT = `
local raw = redis.call('GET', KEYS[1])
if not raw then return 0 end
local record = cjson.decode(raw)
if record.emailKey == ARGV[1] and record.codeHash == ARGV[2] then
  redis.call('DEL', KEYS[1])
  return 1
end
record.failedAttempts = tonumber(record.failedAttempts or 0) + 1
if record.failedAttempts >= tonumber(ARGV[3]) then
  redis.call('DEL', KEYS[1])
  return -2
end
local ttl = redis.call('PTTL', KEYS[1])
if ttl <= 0 then
  redis.call('DEL', KEYS[1])
  return 0
end
redis.call('SET', KEYS[1], cjson.encode(record), 'XX', 'PX', ttl)
return -1
`

/** Redis challenge store: compare, attempt increment, exhaustion, and consume are one operation. */
export const makeRedisOtpChallengeStore = (
  alias = OTP_CHALLENGE_STORE, resourceAlias = OTP_RESOURCE
): OtpChallengeStore => {
  const service = appendContextual<OtpChallengeStore>(alias, {
    issue: async (challenge, ttlSeconds): Promise<boolean> => {
      const ctx = service.ctx as OtpContext<OtpConfig>
      const resource = ctx.resource<RedisResource<ChallengeResourceRecord>>(resourceAlias)
      try {
        const result = await resource.db.client.set(
          resource.key(challenge.id), JSON.stringify({ ...challenge, failedAttempts: 0 }),
          'EX', ttlSeconds, 'NX'
        )
        return result === 'OK'
      } catch (error) {
        const unavailable = new OtpUnavailable('challenge')
        if (error instanceof Error) unavailable.oiriginalStack = `${error}: ${error.stack}`
        throw unavailable
      }
    },
    verify: async (id, emailKey, codeHash, maxFailedAttempts): Promise<OtpChallengeOutcome> => {
      const ctx = service.ctx as OtpContext<OtpConfig>
      const resource = ctx.resource<RedisResource<ChallengeResourceRecord>>(resourceAlias)
      try {
        const result = Number(await resource.db.client.eval(
          REDIS_VERIFY_SCRIPT, 1, resource.key(id), emailKey, codeHash, String(maxFailedAttempts)
        ))
        if (result === 1) return Outcome.Verified
        if (result === -1) return Outcome.Invalid
        if (result === -2) return Outcome.Exhausted
        return Outcome.Missing
      } catch (error) {
        const unavailable = new OtpUnavailable('challenge')
        if (error instanceof Error) unavailable.oiriginalStack = `${error}: ${error.stack}`
        throw unavailable
      }
    },
  })

  return service
}
