import { AppType, makeBasicContext } from '@owlmeans/context'
import { MAILER_SERVICE, makeConsoleMailerService } from '@owlmeans/mailer'
import { makeMemoryOtpChallengeStore } from '../src/challenge.js'
import { makeMemoryThrottleService } from '../src/throttle.js'
import { makeOtpService } from '../src/service.js'
import {
  OTP_CHALLENGE_STORE, OTP_EMAIL_THROTTLE_RULES, OTP_THROTTLE_SERVICE,
} from '../src/consts.js'
import type { OtpConfig } from '../src/types.js'

export const makeOtpTestContext = (opts: { throttle?: boolean, now?: () => number } = {}) => {
  const cfg: OtpConfig = {
    ready: false,
    service: 'server-auth-otp-tests',
    type: AppType.Backend,
    services: {},
    otp: {
      mailerAlias: MAILER_SERVICE,
      challengeStoreAlias: OTP_CHALLENGE_STORE,
      ...(opts.throttle === true ? {
        throttleAlias: OTP_THROTTLE_SERVICE,
        throttleRules: OTP_EMAIL_THROTTLE_RULES,
      } : {}),
    },
  }
  const context = makeBasicContext(cfg)
  const mailer = makeConsoleMailerService(MAILER_SERVICE)
  context.registerService(mailer)
  context.registerService(makeMemoryOtpChallengeStore(OTP_CHALLENGE_STORE, opts.now))
  if (opts.throttle === true) {
    context.registerService(makeMemoryThrottleService(OTP_THROTTLE_SERVICE, opts.now))
  }
  const otp = makeOtpService()
  context.registerService(otp)

  return { context, mailer, otp }
}

export const codeFrom = (text: string | undefined): string => {
  const match = text?.match(/\b(\d{6})\b/)
  if (match == null) throw new Error('OTP code missing from captured message')
  return match[1]
}
