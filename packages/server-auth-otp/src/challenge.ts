import { appendContextual, createService } from '@owlmeans/context'
import type { RedisResource } from '@owlmeans/redis-resource'
import { OtpUnavailable } from './errors.js'
import { OTP_CHALLENGE_STORE, OTP_RESOURCE, type OtpChallengeOutcome, OtpChallengeOutcome as Outcome } from './consts.js'
import type { OtpChallengeStore, OtpConfig, OtpContext } from './types.js'
import { REDIS_VERIFY_SCRIPT } from './consts.local.js'
import type { ChallengeResourceRecord, Clock, StoredChallenge } from './types.local.js'


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
