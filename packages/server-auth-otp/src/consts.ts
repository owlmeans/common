export const SERVER_AUTH_OTP = 'server-auth-otp'
export const OTP_CHALLENGE_STORE = 'auth-otp-challenge-store'
export const OTP_THROTTLE_SERVICE = 'auth-otp-throttle'

export const OTP_EMAIL_THROTTLE_RULES = Object.freeze([
  Object.freeze({ limit: 1, windowSeconds: 60 }),
  Object.freeze({ limit: 10, windowSeconds: 60 * 60 }),
])

/** The OTP auth plugin type key — passed as credential.type in init requests */
export {
  OTP_AUTH_TYPE, OTP_SERVICE, OTP_RESOURCE, OTP_TTL_SECONDS, OTP_CODE_LENGTH,
  OTP_MAX_FAILED_ATTEMPTS,
} from '@owlmeans/auth-otp'
