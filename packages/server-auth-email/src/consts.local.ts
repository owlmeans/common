/** The scrypt parameters of a new password hash: 32 MiB of memory per hash. */
export const SCRYPT_PREFIX = 'scrypt'
export const SCRYPT_COST = 32768
export const SCRYPT_BLOCK_SIZE = 8
export const SCRYPT_PARALLELISM = 1
export const SCRYPT_KEY_LENGTH = 32
export const SCRYPT_SALT_LENGTH = 16
export const SCRYPT_MAX_MEMORY = 64 * 1024 * 1024
/** The highest cost a stored hash may name; anything above is an unknown format, never computed. */
export const SCRYPT_MAX_COST = 1 << 20

/**
 * A well-formed hash of a password nobody knows: an account without a password is checked against
 * it, so "no password" takes as long as "wrong password".
 */
export const ABSENT_PASSWORD_HASH =
  'scrypt$32768$8$1$b3dsbWVhbnMtYWJzZW50$YWJzZW50LXBhc3N3b3JkLWhhc2gtb2YtMzItYnl0ZXM'

/** Separates the parts of a PIN challenge (`email::issuanceId`) and of a confirmation. */
export const CHALLENGE_DELIMITER = '::'

/** The message of every developer waiver starts with it, so no other envelope reads as one. */
export const WAIVER_MESSAGE_PREFIX = 'email-waiver:'

/** Bytes of an offer ticket and of a password challenge. */
export const TICKET_BYTES = 32
export const PASSWORD_CHALLENGE_BYTES = 32

/** Spend a ticket only when it is bound to the asking account; otherwise leave it as it is. */
export const REDIS_SPEND_TICKET_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  redis.call('DEL', KEYS[1])
  return 1
end
return 0
`

/** What `AuthenFailed` puts in front of its reason (`auth:manager:authen:<reason>`). */
export const AUTHEN_FAILED_PREFIX = 'auth:manager:authen:'

/** Milliseconds in a day. */
export const DAY = 24 * 60 * 60 * 1000
