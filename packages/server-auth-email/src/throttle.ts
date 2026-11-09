import { randomBytes } from 'node:crypto'
import { OtpThrottled } from '@owlmeans/server-auth-otp'
import type { AuthThrottleService } from '@owlmeans/server-auth-otp'
import { logger, logThrottle } from '@owlmeans/log'
import { EMAIL_AUTH_THROTTLE_RULES } from './consts.js'
import { emailAuthKeyHelper } from './keys.js'
import type { EmailAuthContext, EmailAuthServerOptions } from './types.js'
import type { EmailAuthThrottle } from './throttle/types.js'

const log = logger('server-auth-email')

export const makeEmailAuthThrottle = (
  ctx: EmailAuthContext, opts: Pick<EmailAuthServerOptions, 'throttleAlias' | 'throttle'>
): EmailAuthThrottle => {
  const rules = { ...EMAIL_AUTH_THROTTLE_RULES, ...opts.throttle }

  const consume: EmailAuthThrottle['consume'] = async (rule, subject) => {
    const windows = rules[rule]
    if (opts.throttleAlias == null || windows == null || windows.length === 0 || subject == null || subject === '') {
      return
    }
    const key = emailAuthKeyHelper.throttleKey(rule, subject)
    const decision = await ctx.service<AuthThrottleService>(opts.throttleAlias)
      .consume(key, windows, randomBytes(16).toString('hex'))
    if (!decision.allowed) {
      if (logThrottle(`auth-email:throttled:${key}`, 60_000)) {
        log.warn('E-mail sign-in refused: throttled', {
          reason: `email-throttled:${rule}`, retryAfter: decision.retryAfter,
        }, { event: 'auth.refused' })
      }
      throw new OtpThrottled(decision.retryAfter)
    }
  }

  return { consume }
}
