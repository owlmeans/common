// --- Methods, auth types and envelopes ---------------------------------------------------------

/** The client `AuthenticationPlugin` type and the login method id of e-mail sign-in. */
export const EMAIL_LOGIN_METHOD = 'email'

/** The private server plugin of a PIN sign-in, and the type its signed token carries. */
export const EMAIL_PIN_AUTH_TYPE = 'email-pin'

/** The private server plugin of a password sign-in, and the type its signed token carries. */
export const EMAIL_PASSWORD_AUTH_TYPE = 'email-password'

/** A purpose-bound confirmation challenge (set, change or remove a password). */
export const EMAIL_CONFIRM_ENVELOPE = 'email-confirm'

/** A developer's captcha and throttle waiver. */
export const EMAIL_WAIVER_ENVELOPE = 'email-waiver'

/** The request header that carries an `EMAIL_WAIVER_ENVELOPE`. */
export const EMAIL_WAIVER_HEADER = 'x-owlmeans-email-waiver'

/** The captcha action of a send-PIN request. */
export const EMAIL_CAPTCHA_ACTION_PIN = 'email_pin'

/** The captcha action of a password sign-in. */
export const EMAIL_CAPTCHA_ACTION_PASSWORD = 'email_password'

/**
 * The identity-linking details type of an account's e-mail credential — the same value as
 * `OTP_AUTH_TYPE` (`@owlmeans/auth-otp`), so e-mail sign-in and e-mail OTP land on one account.
 * It names a credential, never a token type.
 */
export const EMAIL_IDENTITY_TYPE = 'email-otp'

// --- Policy ------------------------------------------------------------------------------------

/** Digits in a PIN — the same as `OTP_CODE_LENGTH` (`@owlmeans/auth-otp`). */
export const EMAIL_PIN_LENGTH = 6
export const EMAIL_PIN_PATTERN = '^[0-9]{6}$'

/** How long a device stays remembered after a successful sign-in on it. */
export const EMAIL_DEVICE_TTL_DAYS = 30
/** Remembered devices per account; the oldest beyond it are forgotten. */
export const EMAIL_DEVICE_LIMIT = 10
/** A device id: 22 base64url characters (16 random bytes) from the client, up to 64 accepted. */
export const EMAIL_DEVICE_ID_PATTERN = '^[A-Za-z0-9_-]{22,64}$'

/** Lifetime of the one-use "set a password" offer ticket a PIN sign-in returns. */
export const EMAIL_OFFER_TTL_SECONDS = 900
/** Lifetime of a developer waiver. */
export const EMAIL_WAIVER_TTL_SECONDS = 7200

export const EMAIL_PASSWORD_MIN_LENGTH = 8
export const EMAIL_PASSWORD_MAX_LENGTH = 128

/** Wire bounds of the request fields (the password policy above is checked by the server). */
export const EMAIL_ADDRESS_MAX_LENGTH = 254
export const EMAIL_PASSWORD_WIRE_MAX_LENGTH = 1024
export const EMAIL_TOKEN_MAX_LENGTH = 4096
export const EMAIL_LOCALE_MAX_LENGTH = 16

/** The languages the sign-in mails are written in; any other locale falls back to `en`. */
export const EMAIL_AUTH_LOCALES = Object.freeze(['en', 'pl', 'ru', 'be', 'uk', 'es', 'de', 'fr'] as const)

export enum EmailPasswordPurpose {
  Set = 'set',
  Change = 'change',
  Remove = 'remove',
}

/**
 * The purpose a confirmation PIN of the new-device PIN switch (`password/device-pin`) is bound to.
 * The switch mails that PIN itself — `password/pin` never asks for it.
 */
export const EMAIL_DEVICE_PIN_PURPOSE = 'device-pin'

export enum EmailSignInReason {
  /** The password was not checked: the device is unknown, so a PIN was mailed instead. */
  Device = 'device',
}

// --- Service aliases ---------------------------------------------------------------------------

/** The server service alias. */
export const EMAIL_AUTH_SERVICE = 'auth-email'
/** The client service alias. */
export const EMAIL_LOGIN_SERVICE = 'auth-email-client'
/** The gate service standing over the developer (tech) routes. */
export const EMAIL_AUTH_TECH_GATE = 'auth-email:tech-gate'

// --- Paths -------------------------------------------------------------------------------------

export const EMAIL_AUTH_API_PATH = '/auth/email'
export const EMAIL_AUTH_OFFER_PATH = '/login/password'

// --- Protocol tree aliases ---------------------------------------------------------------------

export const EMAIL_AUTH_BASE = 'auth-email:base'
export const EMAIL_AUTH_OPTIONS = 'auth-email:options'
export const EMAIL_AUTH_PIN = 'auth-email:pin'
export const EMAIL_AUTH_SIGN_IN = 'auth-email:sign-in'
export const EMAIL_AUTH_PASSWORD = 'auth-email:password'
export const EMAIL_AUTH_PASSWORD_STATUS = 'auth-email:password:status'
export const EMAIL_AUTH_PASSWORD_PIN = 'auth-email:password:pin'
export const EMAIL_AUTH_PASSWORD_SET = 'auth-email:password:set'
export const EMAIL_AUTH_PASSWORD_REMOVE = 'auth-email:password:remove'
export const EMAIL_AUTH_PASSWORD_DECLINE = 'auth-email:password:decline'
export const EMAIL_AUTH_PASSWORD_DEVICE_PIN = 'auth-email:password:device-pin'
export const EMAIL_AUTH_TECH = 'auth-email:tech'
export const EMAIL_AUTH_TECH_PIN = 'auth-email:tech:pin'
export const EMAIL_AUTH_TECH_WAIVER = 'auth-email:tech:waiver'
export const EMAIL_AUTH_OFFER = 'auth-email:offer'
