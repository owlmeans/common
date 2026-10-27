import type { BotConnection } from '@owlmeans/bot'
import type {
  BotMockCall, BotNormalizedUpdate, BotPlatformConnection, BotPlatformMock, BotPlatformSession,
  BotReceiverEmit,
} from '../types.js'

// ─── Native shapes (https://discord.com/developers/docs/resources/message) — the fields used ───

export interface DiscordUser {
  id: string
  username: string
  discriminator?: string
  global_name?: string | null
  avatar?: string | null
  bot?: boolean
}

/** A partial guild member, as `MESSAGE_CREATE` carries it (no `user`) or Modify Guild Member answers it. */
export interface DiscordMember {
  user?: DiscordUser
  nick?: string | null
  roles: string[]
  joined_at: string | null
  deaf?: boolean
  mute?: boolean
  flags?: number
  communication_disabled_until?: string | null
}

export interface DiscordMessageReference {
  /** 0 DEFAULT (a reply), 1 FORWARD. */
  type?: number
  message_id?: string
  channel_id?: string
  guild_id?: string
  fail_if_not_exists?: boolean
}

export interface DiscordMessage {
  id: string
  channel_id: string
  /** Gateway events only: the guild the message was sent in; absent in a direct message. */
  guild_id?: string
  author: DiscordUser
  member?: DiscordMember
  content: string
  timestamp: string
  edited_timestamp: string | null
  tts?: boolean
  mention_everyone?: boolean
  mentions?: DiscordUser[]
  mention_roles?: string[]
  attachments?: unknown[]
  embeds?: unknown[]
  pinned?: boolean
  webhook_id?: string
  /** 0 DEFAULT, 19 REPLY; anything else is a system message. */
  type?: number
  message_reference?: DiscordMessageReference
  /** The message a reply answers; `null` when it was deleted. */
  referenced_message?: DiscordMessage | null
}

/** One gateway frame (https://discord.com/developers/docs/events/gateway-events#payload-structure). */
export interface DiscordGatewayPayload<T = unknown> {
  op: number
  d: T
  s?: number | null
  t?: string | null
}

export interface DiscordHello {
  heartbeat_interval: number
}

export interface DiscordReady {
  v: number
  user: DiscordUser
  session_id: string
  resume_gateway_url: string
  guilds?: unknown[]
  application?: { id: string, flags?: number }
}

/** Get Gateway Bot. */
export interface DiscordGatewayBot {
  url: string
  shards?: number
  session_start_limit?: { total: number, remaining: number, reset_after: number, max_concurrency: number }
}

/** A REST refusal: `{ code, message, errors? }`; a 429 adds `retry_after` (seconds) and `global`. */
export interface DiscordErrorBody {
  code?: number
  message?: string
  errors?: unknown
  retry_after?: number
  global?: boolean
}

// ─── The socket seam ───

/** The part of a WebSocket the gateway client uses — the global `WebSocket` live, an in-process fake mock. */
export interface DiscordSocket {
  readonly readyState: number
  onopen: ((event: unknown) => void) | null
  onmessage: ((event: { data: unknown }) => void) | null
  onclose: ((event: { code: number, reason: string }) => void) | null
  onerror: ((event: unknown) => void) | null
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
}

/** Opens a socket to a gateway URL. */
export interface DiscordSocketFactory {
  (url: string): DiscordSocket
}

// ─── The plugin's parts ───

export interface DiscordBotPlatformOptions {
  /** The REST API, default `https://discord.com/api/v10`. */
  base?: string
  /** A live connection's socket factory, default the global `WebSocket` (Bun, Node ≥ 22). */
  socket?: DiscordSocketFactory
  /** The first reconnect delay of the gateway, default 1 s (doubling up to 30 s); invalid sessions wait 1–5×. */
  reconnectMs?: number
  /** The `User-Agent` of REST calls, default `DISCORD_USER_AGENT`. */
  userAgent?: string
}

export interface DiscordCallOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

/** The REST API over a session's transport. */
export interface DiscordApi {
  /**
   * `<method> <base><path>` with `Authorization: Bot <token>` and a JSON body; a 204 answers
   * `undefined`. A 429 waits `retry_after` and tries again (bounded).
   * @throws {DiscordApiError} a refusal or a fault — never naming the token
   */
  call: <T>(method: string, path: string, body?: unknown, opts?: DiscordCallOptions) => Promise<T>
}

export interface DiscordApiFactory {
  (session: Pick<BotPlatformSession, 'connection' | 'fetch'>, base: string, userAgent?: string): DiscordApi
}

export interface DiscordNormalizer {
  /** A `MESSAGE_CREATE` / `MESSAGE_UPDATE` dispatch → one update; anything else (and the bot's own message) → none. */
  normalize: (payload: unknown, connection: BotConnection) => BotNormalizedUpdate[]
}

/** The invite link, its permissions and the steps a person takes. */
export interface DiscordSetupHelper {
  /** The invite's permission bit set, as the decimal string the URL carries. */
  permissions: () => string
  /** `https://discord.com/oauth2/authorize?client_id=<applicationId>&scope=bot&permissions=<bits>`. */
  inviteUrl: (applicationId: string) => string
  /** The connection's setup steps — the invite link once the application id is saved. */
  steps: (connection: Pick<BotPlatformConnection, 'credentials'>) => string[]
}

/** What one gateway client works with. */
export interface DiscordGatewayDeps {
  /** The connection id — for log lines only. */
  connection: string
  token: string
  api: DiscordApi
  socket: DiscordSocketFactory
  emit: BotReceiverEmit
  signal: AbortSignal
  reconnectMs: number
}

/** The gateway client of one receiver run: identify, heartbeat, dispatch, resume. */
export interface DiscordGateway {
  /**
   * Connect and hand every message dispatch to `emit` (awaited, in order) until `signal` aborts.
   * Reconnects (resuming where it can) on a dropped connection, op 7 and op 9; throws a
   * `DiscordGatewayError` on a close code that must not be retried and after repeated failures.
   */
  run: () => Promise<void>
}

export interface DiscordGatewayFactory {
  (deps: DiscordGatewayDeps): DiscordGateway
}

/** How one gateway connection ended. */
export interface DiscordGatewayOutcome {
  /** The session may be resumed (op 6) on the next connection. */
  resumable: boolean
  /** It reached READY / RESUMED and nothing failed. */
  healthy: boolean
  /** Wait this long before reconnecting (else the backoff decides). */
  waitMs?: number
  /** Do not reconnect: the run fails with this. */
  fatal?: unknown
  /** The inbox refused a dispatch: resumed and replayed; thrown once the failures repeat. */
  fault?: unknown
}

export interface DiscordMock extends BotPlatformMock {
  /** The fake gateway for a mock connection: in process, no network. */
  socket: (connection: BotPlatformConnection) => DiscordSocketFactory
  /** The username the fake Get Current User answers for a connection id: `mock_<id>_bot`. */
  usernameOf: (connection: string) => string
  /** The fake bot's user id: the application id when it is a snowflake, else derived from the connection id. */
  userIdOf: (connection: Pick<BotPlatformConnection, 'id' | 'credentials'>) => string
}

/** One fake gateway socket of a mock connection. */
export interface DiscordMockSocket {
  socket: DiscordSocket
  /** Identified or resumed — dispatches flow. */
  live: boolean
  /** Hand a frame to the client (asynchronously, as a network would). */
  push: (payload: DiscordGatewayPayload) => void
}

/** One mock connection's state. */
export interface DiscordMockState {
  /** The last snowflake handed out — ids only grow; each carries random low bits, so processes do not meet. */
  lastId: bigint
  /** The gateway sequence. */
  sequence: number
  /** Dispatches fed and not yet delivered to a live socket. */
  queue: DiscordGatewayPayload[]
  calls: BotMockCall[]
  /** Message ids the fake bot sent — a simulated reply to one is a reply to the bot. */
  sent: Set<string>
  sockets: Set<DiscordMockSocket>
}
