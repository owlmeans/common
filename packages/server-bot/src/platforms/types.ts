import type {
  BotActionKind, BotChatRef, BotConnection, BotHookReply, BotMessageRef, BotPlatform, BotPlatformDescriptor,
  BotSimulateInput, BotTransport, BotUpdate,
} from '@owlmeans/bot'
import type { BotHookRequest } from '../types.js'

// ─── I/O ───

/** The request a plugin makes — a subset of `RequestInit` both transports honour. */
export interface BotFetchInit {
  method?: string
  headers?: Record<string, string>
  body?: string
  signal?: AbortSignal
}

/**
 * The ONLY way a plugin reaches its platform over HTTP. Live: the global `fetch`. Mock: the plugin's
 * fake API answering the same URLs with the platform's own answer shapes — so a mock connection runs
 * every line of the live code path except the socket.
 */
export interface BotFetch {
  (url: string, init?: BotFetchInit): Promise<Response>
}

/** Who the bot is on its platform, as verification answered. */
export interface BotPlatformIdentity {
  id: string
  username?: string
  name?: string
}

/**
 * A connection as a plugin sees it: the public view plus what never leaves the server — the opened
 * credentials (`{}` when none) and the per-connection hook secret.
 */
export interface BotPlatformConnection extends BotConnection {
  credentials: Record<string, string>
  hookSecret: string
}

/** One plugin call's world: the connection and the transport it must use. */
export interface BotPlatformSession {
  connection: BotPlatformConnection
  transport: BotTransport
  /** Live `fetch`, or the plugin's own mock API bound to this connection. */
  fetch: BotFetch
}

// ─── Inbound ───

/** How a hook request proved itself. */
export type BotAuthentication =
  | { result: 'ok' }
  /** A subscription handshake: answer it and store nothing (`text` → plain text, else `reply` as JSON). */
  | { result: 'challenge', reply?: BotHookReply, text?: string }
  /** Not the platform — answered 401; `reason` is logged, never shown. */
  | { result: 'reject', reason: string }

/** One update a native payload carried, normalized but not yet stored. */
export interface BotNormalizedUpdate {
  /** The platform's own update id — the dedupe key's tail, unique per connection. */
  platformId: string
  update: Omit<BotUpdate, 'id' | 'connection' | 'scope' | 'platform' | 'matches' | 'receivedAt'>
}

/** Hand a native payload to the inbox — a receiver awaits it before confirming the update. */
export interface BotReceiverEmit {
  (payload: unknown): Promise<void>
}

// ─── Outbound ───

/** A platform call `act` makes; the service resolves targets and checks support first. */
export type BotPlatformAction =
  | { kind: BotActionKind.Reply, to: BotMessageRef, text: string }
  | { kind: BotActionKind.Send, chat: BotChatRef, text: string }
  | { kind: BotActionKind.Delete, message: BotMessageRef }
  | { kind: BotActionKind.Mute, chat: string, user: string, space?: string, until: Date }
  | { kind: BotActionKind.Ban, chat: string, user: string, space?: string }
  | { kind: BotActionKind.React, message: BotMessageRef, emoji: string }

/** What a successful call produced. */
export interface BotPlatformActionResult {
  /** The message a reply / send created. */
  message?: BotMessageRef
}

// ─── Mock ───

/** One call the mock API answered. */
export interface BotMockCall {
  method: string
  params: Record<string, unknown>
  at: string
  /**
   * Which credential made the call, where the platform has more than one — in the plugin's words
   * (Slack: `bot` the bot token, `user` the admin user token, `none` no token). Absent elsewhere.
   */
  auth?: string
}

/** A native inbound request: the payload, the exact bytes and the headers that sign them. */
export interface BotNativeInbound {
  body: unknown
  rawBody: string
  headers: Record<string, string>
}

/** The plugin's fake of its platform — API-faithful answers, no network. */
export interface BotPlatformMock {
  /** The fake API for one connection; records every call. */
  fetch: (connection: BotPlatformConnection) => BotFetch
  /**
   * The native payload for `input`. `simulate` hands its `body` straight to `normalize` and the inbox;
   * a webhook platform's mock also signs it the way the platform signs (the bytes and headers pass
   * `authenticate` when POSTed to the hook route — the end-to-end diagnostic).
   */
  inbound: (input: BotSimulateInput, connection: BotPlatformConnection) => BotNativeInbound
  /** Queue a native payload for the connection's mock receiver (in-process). */
  feed: (connection: string, payload: unknown) => void
  /** The calls the fake API answered for a connection, oldest first. */
  calls: (connection: string) => BotMockCall[]
  /** Forget a connection's mock state (every connection's when omitted). */
  reset: (connection?: string) => void
}

// ─── The plugin ───

/**
 * One messaging platform. A plugin is plain code over its session's `fetch` — it holds no storage,
 * no credentials and no timers of its own; the service decides when it runs and with which transport.
 * Every method may throw: the service records the failure (actions answer `{ ok: false }`).
 */
export interface BotPlatformPlugin {
  platform: BotPlatform
  /** `BOT_PLATFORMS[platform]` — the contract's descriptor, never a copy that could drift. */
  descriptor: BotPlatformDescriptor
  /**
   * Who the bot is — the credentials check. A refusal of the credentials (or a missing required
   * one) throws `BotCredentialsRejected`; anything else is a fault.
   */
  verify: (session: BotPlatformSession) => Promise<BotPlatformIdentity>
  /** Auto-setup webhook platforms: point the platform at `url`, signed with `connection.hookSecret`. */
  registerHook?: (session: BotPlatformSession, url: string) => Promise<void>
  unregisterHook?: (session: BotPlatformSession) => Promise<void>
  /** Whether `url` is an address this platform will post to (ports, scheme); default: any public HTTPS. */
  acceptsHookUrl?: (url: string) => boolean
  /** The steps a person takes in the platform's console (manual setup, rights the bot needs). */
  setup?: (connection: BotPlatformConnection) => string[]
  /** Prove a hook request came from the platform — timing-safe, over `rawBody` where it signs. */
  authenticate: (request: BotHookRequest, connection: BotPlatformConnection) => BotAuthentication | Promise<BotAuthentication>
  /** The updates a native payload carries; an update kind the bot ignores answers none. */
  normalize: (payload: unknown, connection: BotConnection) => BotNormalizedUpdate[]
  /**
   * Poll / gateway platforms: run until `signal` aborts, handing every native payload to `emit`
   * (and awaiting it) before confirming it to the platform. A recoverable throw (a network fault, a
   * gateway that kept dropping) is reported as the connection's `lastError` and the worker restarts
   * the receiver at its next reconciliation; a {@link BotPlatformPlugin.fatal} one marks the
   * connection `failed` and no receiver runs for it until it is verified or saved again.
   */
  receiver?: (session: BotPlatformSession, emit: BotReceiverEmit, signal: AbortSignal) => Promise<void>
  /**
   * Whether a receiver's fault is one no restart fixes — a revoked token, a configuration the
   * platform refuses (Telegram 401/404 on `getUpdates`, Discord close codes 4004 and 4010–4014). A
   * `BotCredentialsRejected` is fatal without asking; absent, nothing else is.
   */
  fatal?: (error: unknown) => boolean
  /** One platform call. Throws on refusal or fault; the service turns that into `{ ok: false }`. */
  act: (session: BotPlatformSession, action: BotPlatformAction) => Promise<BotPlatformActionResult>
  mock: BotPlatformMock
}
