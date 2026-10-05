import { appendContextual } from '@owlmeans/context'
import { AuthenFailed } from '@owlmeans/auth'
import { type OtpService, OTP_SERVICE, OTP_TTL_SECONDS, OTP_CODE_LENGTH, OTP_MAX_FAILED_ATTEMPTS, OTP_RESOURCE } from '@owlmeans/auth-otp'
import { type MailerService, MAILER_SERVICE } from '@owlmeans/mailer'
import { randomBytes, randomInt } from 'node:crypto'
import type { AuthThrottleService, OtpChallengeStore, OtpConfig, OtpContext } from './types.js'
import { OtpChallengeOutcome, OTP_CHALLENGE_STORE } from './consts.js'
import { throttleKeyHelper } from './throttle-keys.js'
import { otpKeyHelper } from './keys.js'
import { OtpThrottled, OtpUnavailable } from './errors.js'
import { makeRedisOtpChallengeStore } from './challenge.js'
import { logger, logThrottle } from '@owlmeans/log'

const log = logger('server-auth-otp')

/** An e-mail as a log may carry it: its domain only. */
const domainOf = (email: string): string => email.slice(email.lastIndexOf('@') + 1)

const generateCode = (): string => {
  const digits = randomInt(0, Math.pow(10, OTP_CODE_LENGTH))
  return String(digits).padStart(OTP_CODE_LENGTH, '0')
}

export const makeOtpService = (alias = OTP_SERVICE): OtpService => {
  let fallbackChallenges: OtpChallengeStore | undefined

  const challengeStore = (ctx: OtpContext<OtpConfig>): OtpChallengeStore => {
    const challengeAlias = ctx.cfg.otp?.challengeStoreAlias ?? OTP_CHALLENGE_STORE
    if (ctx.hasService(challengeAlias)) return ctx.service<OtpChallengeStore>(challengeAlias)

    // Backwards-compatible secure default: existing consumers that registered only OTP_RESOURCE
    // still get the atomic Redis store. New consumers can inject the real memory implementation.
    if (fallbackChallenges == null) {
      fallbackChallenges = makeRedisOtpChallengeStore(
        `${alias}:redis-challenge`, ctx.cfg.otp?.resourceAlias ?? OTP_RESOURCE
      )
      fallbackChallenges.registerContext(ctx)
    }
    return fallbackChallenges
  }

  const service: OtpService = appendContextual<OtpService>(alias, {
    issueChallenge: async (email: string): Promise<string> => {
      const ctx = service.ctx as OtpContext<OtpConfig>
      const mailerAlias = ctx.cfg.otp?.mailerAlias ?? MAILER_SERVICE
      const challenges = challengeStore(ctx)
      const mailer = ctx.service<MailerService>(mailerAlias)
      const code = generateCode()
      const issuanceId = randomBytes(18).toString('base64url')

      const throttleAlias = ctx.cfg.otp?.throttleAlias
      const throttleRules = ctx.cfg.otp?.throttleRules
      if (throttleAlias != null && throttleRules != null) {
        const decision = await ctx.service<AuthThrottleService>(throttleAlias)
          .consume(throttleKeyHelper.emailThrottleKey(email), throttleRules, issuanceId)
        if (!decision.allowed) {
          if (logThrottle(`otp-throttled:${otpKeyHelper.otpEmailKey(email)}`, 60_000)) {
            log.warn('Login code refused: throttled', {
              reason: 'otp-throttled', emailDomain: domainOf(email), retryAfter: decision.retryAfter,
            }, { event: 'auth.refused' })
          }
          throw new OtpThrottled(decision.retryAfter)
        }
      }

      const issued = await challenges.issue({
        id: otpKeyHelper.otpChallengeKey(issuanceId),
        emailKey: otpKeyHelper.otpEmailKey(email),
        codeHash: otpKeyHelper.otpCodeHash(issuanceId, code),
      }, OTP_TTL_SECONDS)
      if (!issued) throw new OtpUnavailable('issuance-collision')

      await mailer.send({
        to: email,
        subject: 'Your login code',
        text: `Your one-time login code is: ${code}\n\nIt expires in ${OTP_TTL_SECONDS / 60} minutes.`,
        html: `<p>Your one-time login code is: <strong>${code}</strong></p><p>It expires in ${OTP_TTL_SECONDS / 60} minutes.</p>`,
      })

      return issuanceId
    },

    verifyChallenge: async (email: string, issuanceId: string, code: string): Promise<void> => {
      const ctx = service.ctx as OtpContext<OtpConfig>
      const outcome = await challengeStore(ctx).verify(
        otpKeyHelper.otpChallengeKey(issuanceId), otpKeyHelper.otpEmailKey(email), otpKeyHelper.otpCodeHash(issuanceId, code),
        OTP_MAX_FAILED_ATTEMPTS
      )
      if (outcome !== OtpChallengeOutcome.Verified) {
        // The sign-in refusal itself (`auth.refused`) is logged where the manager decides sign-in.
        log.debug('OTP challenge refused', { outcome, emailDomain: domainOf(email) })
        throw new AuthenFailed('otp:code')
      }
    },
  })

  return service
}
