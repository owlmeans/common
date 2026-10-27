import type {
  BotActionKind, BotActivity, BotActivityTarget, BotChatRef, BotConnection, BotConnectionInput, BotConnectionStatus,
  BotHookReply, BotMatchMode, BotMessageRef, BotPlatform, BotReceiveMode, BotRule, BotRuleAction, BotRuleInput,
  BotSimulateInput, BotSimulateResult, BotTransport, BotUpdate,
} from '@owlmeans/bot'
import type { BasicConfig, BasicContext, LazyService } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { ResourceRecord } from '@owlmeans/resource'
import type { BotInboxStatus } from './consts.js'
import type { BotFetch, BotPlatformIdentity, BotPlatformPlugin } from './platforms/types.js'

// ─── Records (what a store keeps — `@owlmeans/bot-postgres` registers resources over these) ───

/**
 * A connection as stored. The public fields of `BotConnection` (minus the computed `lastEventAt`),
 * plus what never leaves the server: the sealed credentials and the per-connection hook secret.
 *
 * Optional fields may come back `null` from a database; the service reads them as absent.
 */
export interface BotConnectionRecord extends ResourceRecord {
  scope: string
  platform: BotPlatform
  label: string
  transport: BotTransport
  status: BotConnectionStatus
  enabled: boolean
  receive: BotReceiveMode
  identity?: BotPlatformIdentity | null
  hookUrl?: string | null
  /** Whether the hook is registered with the platform now (auto-setup platforms). */
  hookRegistered?: boolean | null
  setup?: string[] | null
  /** The credential keys holding a value — readable without the secret. */
  credentialsSet: string[]
  /** AES-256-GCM sealed JSON of the credentials (`v1.<iv>.<tag>.<ciphertext>`); absent when none. */
  sealed?: string | null
  /**
   * A random per-connection secret: Telegram's `secret_token`, and the default of a generated
   * credential — it doubles as the WhatsApp verify token the connection's `setup` steps show the
   * operator to paste into Meta's console. It only proves an inbound request came from the platform
   * (and signs a mock connection's simulated payloads); it is never a credential of the bot's
   * account, never authorizes a call to the platform, and is never returned to a client.
   */
  hookSecret: string
  lastError?: string | null
  createdAt: string
  updatedAt: string
}

/** A rule as stored — `BotRule`, its optional fields nullable. */
export interface BotRuleRecord extends ResourceRecord {
  scope: string
  /** `null` / absent: every connection of the scope. */
  connection?: string | null
  name: string
  keywords: string[]
  mode: BotMatchMode
  action: BotRuleAction
  reply?: string | null
  instruction?: string | null
  enabled: boolean
  order: number
  createdAt: string
  updatedAt: string
}

/** What an inbox row keeps of a normalized update: everything but its id (the row's) and `matches`. */
export interface BotInboxPayload extends Omit<BotUpdate, 'id' | 'matches'> {}

/** One inbound update in the inbox (`bot-update`). */
export interface BotUpdateRecord extends ResourceRecord {
  scope: string
  connection: string
  platform: BotPlatform
  /** `<connection>:<platform>:<platform update id>` — unique: a redelivery is the same row. */
  dedupe: string
  status: BotInboxStatus
  /** How many times a dispatcher claimed it. */
  attempts: number
  /** The names of the handlers that already completed — a retry runs only the rest. */
  handled: string[]
  update: BotInboxPayload
  error?: string | null
  receivedAt: string
  /** When a dispatcher claimed it (the lease of a `processing` row). */
  claimedAt?: string | null
  /** A retried row is not offered again before this instant. */
  retryAt?: string | null
  processedAt?: string | null
}

/** One recorded action — `BotActivity`, its optional fields nullable. */
export interface BotActivityRecord extends ResourceRecord {
  scope: string
  connection: string
  platform: BotPlatform
  update?: string | null
  action: BotActionKind
  target?: BotActivityTarget | null
  text?: string | null
  rule?: string | null
  ok: boolean
  /** Why it failed, as a short sentence a person reads. */
  error?: string | null
  /** The machine marker of the failure (`bot:<marker>:<detail>`) — what code compares, never shown as is. */
  code?: string | null
  transport: BotTransport
  at: string
}

// ─── Service ───

/** Resource aliases — default `bot-connection`, `bot-rule`, `bot-update`, `bot-activity`. */
export interface BotResourceAliases {
  connection?: string
  rule?: string
  update?: string
  activity?: string
}

export interface BotHookUrlMaker {
  (origin: string, platform: BotPlatform, connection: string): string
}

export interface BotSecretSource {
  (): string | undefined
}

export interface BotServiceOptions {
  resources?: BotResourceAliases
  /**
   * The credentials secret; default `process.env.APP_SECRET`. The AES-256-GCM key is
   * HKDF-SHA256(secret, 'owlmeans-bot', 'credentials'). Without one, credentials are refused.
   */
  secret?: BotSecretSource
  /** Default `${origin}/api/bot/hook/${platform}/${connection}`. */
  hookUrl?: BotHookUrlMaker
  /** The platform plugins; default the built-in ones (`BOT_BUILTIN_PLATFORMS`). */
  platforms?: readonly BotPlatformPlugin[]
  /** The live transport's HTTP client; default the global `fetch`. */
  fetch?: BotFetch
  /** Dispatcher poll interval, default 750 ms. */
  pollMs?: number
  /** Receiver reconcile interval, default 15 s. */
  reconcileMs?: number
  /** Tries per inbound update, default 3. */
  attempts?: number
  /** The lease of a claimed row, default 5 min. */
  leaseMs?: number
  /** How long a `done` row is kept, default 7 days; `0` keeps them forever. */
  retainMs?: number
  /** The clock — tests. */
  now?: () => Date
}

export interface BotActivityListOptions {
  connection?: string
  /** 1 … 200, default 50. */
  limit?: number
}

export interface BotConnectionsApi {
  /** The scope's connections, oldest first. */
  list: (scope: string) => Promise<BotConnection[]>
  /** @throws {BotConnectionNotFound} absent or another scope's */
  get: (scope: string, id: string) => Promise<BotConnection>
  /**
   * Create (no `id`) or change a connection. Credentials are write-only: an omitted key keeps its
   * value, `''` clears it. `origin` (the request's public origin) computes `hookUrl`. A changed
   * credential or transport puts the connection back to `pending`.
   *
   * @throws {BotSecretMissing} credentials to seal and no secret
   * @throws {BotCredentialsRejected} a credential key the platform does not know
   * @throws {BotUnsupportedAction} a platform the registry has no plugin for, or a platform change
   */
  save: (scope: string, input: BotConnectionInput, origin?: string) => Promise<BotConnection>
  /**
   * Ask the platform who the bot is, then choose how updates arrive: an auto-setup platform
   * registers its hook when `hookUrl` is public HTTPS, else the connection polls where the platform
   * can; a manual platform gets `setup` steps. The failure is recorded on the connection and thrown.
   *
   * @throws {BotCredentialsRejected}
   */
  verify: (scope: string, id: string, origin?: string) => Promise<BotConnection>
  /** Unregisters the hook (best effort), removes the connection, its own rules and its inbox. */
  remove: (scope: string, id: string) => Promise<{ id: string }>
}

export interface BotRulesApi {
  /** The scope's rules — with `connection`, its own plus the scope-wide ones — by `order`. */
  list: (scope: string, connection?: string) => Promise<BotRule[]>
  /**
   * @throws {BotRuleNotFound} an `id` that is absent or another scope's
   * @throws {BotConnectionNotFound} a `connection` that is not the scope's
   * @throws {BotRuleInvalid} no keyword left after normalization
   */
  save: (scope: string, input: BotRuleInput) => Promise<BotRule>
  /** @throws {BotRuleNotFound} */
  remove: (scope: string, id: string) => Promise<{ id: string }>
}

export interface BotActivityApi {
  /** Newest first. */
  list: (scope: string, opts?: BotActivityListOptions) => Promise<BotActivity[]>
}

/** An inbound hook request as the service reads it — the transport-free part of an HTTP request. */
export interface BotHookRequest {
  method: string
  /** Lower-cased names, as Fastify hands them over. */
  headers: Record<string, string | string[] | undefined>
  query?: Record<string, unknown>
  /** The parsed JSON body. */
  body?: unknown
  /** The exact bytes the platform signed — what a signature is checked over. */
  rawBody?: string | Uint8Array
}

/** What the hook answers the platform. */
export interface BotHookAnswer {
  /** `{ ok: true }`, or a handshake's JSON answer (Slack `{ challenge }`). */
  reply: BotHookReply
  /** A handshake answered as plain text (WhatsApp `hub.challenge`) — the GET hook answers this. */
  text?: string
  /** The inbox rows the request stored (a redelivery answers its existing row), in payload order. */
  updates: string[]
}

export interface BotHandle<C = BasicContext<BasicConfig>> {
  (update: BotUpdate, bot: BotActions, context: C): Promise<void>
}

/** A named reaction to inbound updates — the worker calls every handler, in order, per update. */
export interface BotHandler<C = BasicContext<BasicConfig>> {
  /** Stable: a retried update skips the handlers (by name) that already completed. */
  name: string
  handle: BotHandle<C>
}

/** The worker's loop: the inbox dispatcher and the poll/gateway receivers. */
export interface BotRuntime {
  /** Start dispatching every `pollMs` and reconciling receivers every `reconcileMs`. Idempotent. */
  start: () => Promise<void>
  /** Abort every receiver, stop the timers and wait for the pass in flight. Idempotent. */
  stop: () => Promise<void>
  readonly running: boolean
  /** One dispatch pass now (what the timer runs) — the number of rows it settled. */
  dispatch: () => Promise<number>
  /** One receiver reconciliation now (what the timer runs), retention purge included. */
  reconcile: () => Promise<void>
}

/** A member to mute or ban: an update targets its sender in its chat. */
export type BotMemberTarget = BotUpdate | { chat: BotChatRef | string, user: string, space?: string }

export interface BotActionResult {
  ok: boolean
  /**
   * Why it failed, as ONE short sentence a person — or an agent's model — reads ("Telegram refused:
   * message to delete not found.", "WhatsApp cannot delete messages.").
   */
  error?: string
  /**
   * The machine marker of the same failure (`bot:unsupported-action:delete`,
   * `bot:invalid-action:empty-text`, `bot:telegram:400:…`) — compare this, never the sentence.
   */
  code?: string
  /** What a reply / send created. */
  message?: BotMessageRef
}

export interface BotActionOptions {
  /** The rule the action follows — recorded on the activity. */
  rule?: string
}

export interface BotMuteOptions extends BotActionOptions {
  /** ≥ 1. Telegram reads more than 366 days as forever. */
  minutes: number
}

/**
 * What a handler (or an agent's tools) does with a connection. Every call answers a
 * `BotActionResult` and records one `BotActivity` (transport `live` or `mock`) — it NEVER throws: an
 * unsupported action, a refusal of the platform and a network fault are `{ ok: false, error, code }` —
 * the sentence and its machine marker, both recorded on the activity.
 */
export interface BotActions {
  /** Whether the connection's platform (with its credentials) can do it; `note` always. */
  supports: (kind: BotActionKind) => boolean
  /** Answer a message (an update answers its own message), in its thread. */
  reply: (to: BotUpdate | BotMessageRef, text: string, opts?: BotActionOptions) => Promise<BotActionResult>
  send: (chat: BotChatRef | string, text: string, opts?: BotActionOptions) => Promise<BotActionResult>
  delete: (target: BotUpdate | BotMessageRef, opts?: BotActionOptions) => Promise<BotActionResult>
  mute: (target: BotMemberTarget, opts: BotMuteOptions) => Promise<BotActionResult>
  ban: (target: BotMemberTarget, opts?: BotActionOptions) => Promise<BotActionResult>
  react: (target: BotUpdate | BotMessageRef, emoji: string, opts?: BotActionOptions) => Promise<BotActionResult>
  /** An activity only — no platform call (a refusal explained, a decision recorded). */
  note: (update: BotUpdate, text: string, opts?: BotActionOptions) => Promise<BotActionResult>
}

/** Whom `actions()` acts for: an update (its connection, recorded on every activity) or a connection. */
export type BotActionsTarget = BotUpdate | { scope: string, connection: string }

export interface BotService extends LazyService {
  connections: BotConnectionsApi
  rules: BotRulesApi
  activity: BotActivityApi
  /**
   * The platform's inbound request: authenticate → normalize → inbox (deduplicated) → answer at
   * once. Handlers run later, in the worker. A disabled connection's update is acknowledged and dropped.
   *
   * @throws {BotConnectionNotFound} unknown connection, or the platform does not match
   * @throws {BotSignatureRejected} the request does not prove it came from the platform
   */
  receive: (platform: BotPlatform, connection: string, request: BotHookRequest) => Promise<BotHookAnswer>
  /**
   * A message fed to a MOCK connection: the platform's NATIVE payload, built by the plugin's mock,
   * goes straight into the plugin's `normalize` and the inbox — the path a receiver's payload and an
   * authenticated hook's payload take — and the worker dispatches it like live traffic. No hook is
   * involved, so a gateway-only platform (Discord) needs no hook route for it.
   *
   * @throws {BotConnectionNotFound}
   * @throws {BotTransportMismatch} a live connection
   * @throws {BotConnectionDisabled}
   */
  simulate: (scope: string, connection: string, input: BotSimulateInput) => Promise<BotSimulateResult>
  /** The worker's loop over `handlers` — create it in the worker only, then `start()`. */
  runtime: (handlers: readonly BotHandler<any>[]) => BotRuntime
  /** Never throws: an unknown connection answers every action `{ ok: false }`. */
  actions: (target: BotActionsTarget) => Promise<BotActions>
}

// ─── Serving ───

export interface BotScopeResolver {
  /** The scope (organization key) the request acts for — decided by the server, never the wire. */
  (request: AbstractRequest, context: BasicContext<BasicConfig>): Promise<string>
}

export interface BotServeOptions {
  scope: BotScopeResolver
  /** The service alias, default `BOT_SERVICE`. */
  service?: string
}

export interface BotHookServeOptions {
  /** The service alias, default `BOT_SERVICE`. */
  service?: string
}
