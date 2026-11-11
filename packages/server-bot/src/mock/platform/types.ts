import type {
  BotActionKind, BotCredentialField, BotPlatformGlyph, BotPlatformId, BotPlatformLink, BotReceiveMode, BotTexts,
} from '@owlmeans/bot'

/**
 * A platform made for tests — every switch a real plugin's descriptor has, over a small invented
 * chat API (`POST <base>/<method>`, JSON, `{ ok, result }` / `{ ok: false, error }`) that its mock
 * fakes. The generic suites of the bot packages, the store conformance kit and an application's own
 * tests run on it; nothing in production registers it.
 */
export interface BotTestPlatformOptions {
  /** The platform id; default `test`. */
  platform?: BotPlatformId
  /** Default `Test`. */
  title?: string
  /** Default `chat`. */
  glyph?: BotPlatformGlyph
  /**
   * Default one required secret `token`. A `generated` one is created on save (manual setup shows it);
   * an optional one with `enables` adds its actions and is the credential those calls authorize with.
   */
  credentials?: BotCredentialField[]
  /**
   * The receive modes, preferred first; default webhook then poll — an auto-setup platform that
   * registers its hook on a public HTTPS origin and polls without one. `[gateway]` holds a socket.
   */
  receive?: BotReceiveMode[]
  /** The calls the required credentials allow; default reply, send, delete, mute, ban and react. */
  actions?: BotActionKind[]
  /** Default `auto`; `manual` lists the hook URL and the generated credentials as setup steps. */
  setup?: 'auto' | 'manual'
  /** A pre-save link (an invite) the panels draw. */
  link?: BotPlatformLink
  /** Default English only. */
  hint?: BotTexts
  /** Actions the platform takes only inside a server — without the chat's `space` they refuse `no-space`. */
  spaceActions?: BotActionKind[]
  /** The API base a LIVE connection calls (a test's own `fetch` answers it); default `https://bot.invalid/<platform>`. */
  base?: string
}

/** The test platform's API over one plugin call's session — `POST <base>/<method>`, JSON in and out. */
export interface BotTestApi {
  /**
   * One call. A refusal (`{ ok: false, error }`) throws `BotErrorPlatform` `<id>:<status>:<error>`; a
   * transport fault `<id>:503:<method>: unreachable` (`504 … timeout`).
   */
  call: <T>(method: string, params?: Record<string, unknown>, opts?: BotTestCallOptions) => Promise<T>
}

/** The test platform API's envelope. */
export interface BotTestAnswer {
  ok?: boolean
  result?: unknown
  /** The platform's words for a refusal. */
  error?: string
}

export interface BotTestCallOptions {
  signal?: AbortSignal
  timeoutMs?: number
  /** The credential the call authorizes with (its value as the bearer token); default the first required one. */
  credential?: string
}

/** One update the test platform's API hands a receiver — its native inbound payload. */
export interface BotTestPayload {
  id: number
  message?: BotTestMessage
}

export interface BotTestMessage {
  id: string
  chat: { id: string, kind: string, title?: string, thread?: string, space?: string }
  from?: { id: string, name?: string, username?: string, bot?: boolean }
  text?: string
  date: string
  edited?: boolean
  replyTo?: { id: string, text?: string, from?: { id: string, name?: string, username?: string, bot?: boolean } }
}
