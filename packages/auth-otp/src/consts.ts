export const OTP_SERVICE = 'auth-otp-service'

/** The auth plugin type string that selects the email-OTP auth plugin */
export const OTP_AUTH_TYPE = 'email-otp'

/** Redis resource alias for storing pending OTP codes */
export const OTP_RESOURCE = 'auth-otp-cache'

/** Code TTL in seconds (10 minutes) */
export const OTP_TTL_SECONDS = 600

/** OTP code length (numeric digits) */
export const OTP_CODE_LENGTH = 6
