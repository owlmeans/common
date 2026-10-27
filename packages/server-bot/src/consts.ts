/** The alias `appendBot` registers the service under. */
export const BOT_SERVICE = 'bot'

/**
 * The default resource aliases — a store package (`@owlmeans/bot-postgres`) registers its resources
 * under exactly these strings; `BotServiceOptions.resources` overrides them.
 */
export const RES_BOT_CONNECTION = 'bot-connection'
export const RES_BOT_RULE = 'bot-rule'
export const RES_BOT_UPDATE = 'bot-update'
export const RES_BOT_ACTIVITY = 'bot-activity'

/** How often the worker's dispatcher looks for pending inbox rows. */
export const BOT_POLL_MS = 750

/** How often the worker reconciles its receivers against the enabled connections. */
export const BOT_RECONCILE_MS = 15_000

/** How many times one inbound update is offered to the handlers before it is failed. */
export const BOT_ATTEMPTS = 3

/** A `processing` row older than this is presumed abandoned (a crashed worker) and claimed again. */
export const BOT_LEASE_MS = 5 * 60_000

/** How long a `done` inbox row is kept before the reconciler purges it. */
export const BOT_RETAIN_MS = 7 * 24 * 60 * 60_000

/** The most inbox rows one dispatch pass claims. */
export const BOT_DISPATCH_BATCH = 20

/** The longest a retried row waits before it is offered again. */
export const BOT_RETRY_MAX_MS = 60_000

/** The environment variable the credentials key is derived from when no `secret` option is given. */
export const BOT_SECRET_ENV = 'APP_SECRET'

/** HKDF-SHA256 salt and info of the credentials key — part of the stored format, never change. */
export const BOT_HKDF_SALT = 'owlmeans-bot'
export const BOT_HKDF_INFO = 'credentials'

/** The version prefix of a sealed credentials string: `v1.<iv>.<tag>.<ciphertext>` (base64url). */
export const BOT_SEALED_VERSION = 'v1'

/** Where a target serves the hook tree — the default `hookUrl` is `${origin}${BOT_HOOK_PATH}/<platform>/<id>`. */
export const BOT_HOOK_PATH = '/api/bot/hook'

/** The status of one inbox row. */
export enum BotInboxStatus {
  /** Stored, waiting for the worker (or for its retry time). */
  Pending = 'pending',
  /** Claimed by a dispatcher; `claimedAt` is the lease. */
  Processing = 'processing',
  /** Every handler ran to completion. */
  Done = 'done',
  /** A handler kept failing for `attempts` tries; `error` says why. */
  Failed = 'failed',
}
