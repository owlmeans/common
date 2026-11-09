import { OTP_EMAIL_THROTTLE_RULES } from '@owlmeans/server-auth-otp'
import type { EmailAuthThrottleRules } from './types.js'

/** Resource aliases (lookup keys, not collection names). */
export const EMAIL_AUTH_PASSWORD_RESOURCE = 'auth-email:password'
export const EMAIL_AUTH_DEVICE_RESOURCE = 'auth-email:device'

/** Colon-free collection base names; the db config's `resourcePrefix` is put in front. */
export const EMAIL_AUTH_PASSWORD_COLLECTION = 'email-password'
export const EMAIL_AUTH_DEVICE_COLLECTION = 'email-device'

/** The default windows of every throttle; `EmailAuthServerOptions.throttle` replaces single ones. */
export const EMAIL_AUTH_THROTTLE_RULES: Readonly<EmailAuthThrottleRules> = Object.freeze({
  pinEmail: OTP_EMAIL_THROTTLE_RULES,
  pinIp: Object.freeze([Object.freeze({ limit: 20, windowSeconds: 600 })]),
  pinGlobal: Object.freeze([Object.freeze({ limit: 600, windowSeconds: 60 })]),
  passwordEmail: Object.freeze([Object.freeze({ limit: 10, windowSeconds: 900 })]),
  passwordIp: Object.freeze([Object.freeze({ limit: 50, windowSeconds: 900 })]),
  confirmAccount: Object.freeze([
    Object.freeze({ limit: 1, windowSeconds: 60 }),
    Object.freeze({ limit: 10, windowSeconds: 60 * 60 }),
  ]),
})
