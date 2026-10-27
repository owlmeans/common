import type { BotConnection } from '@owlmeans/bot'
import type {
  BotMockCall, BotNativeInbound, BotNormalizedUpdate, BotPlatformConnection, BotPlatformMock, BotPlatformPlugin,
  BotPlatformSession,
} from '../types.js'

// ─── Native Events API shapes (https://docs.slack.dev/apis/events-api/) — the fields used ───

export interface SlackProfile {
  real_name?: string
  display_name?: string
  name?: string
}

export interface SlackBotProfile {
  id?: string
  name?: string
  app_id?: string
}

/** A `message` event (or the `message` an edit carries) — `ts` is the message id. */
export interface SlackMessage {
  type: 'message'
  subtype?: string
  channel?: string
  /** `channel` · `group` (private channel) · `im` · `mpim`. */
  channel_type?: string
  user?: string
  text?: string
  ts?: string
  event_ts?: string
  /** The thread's parent `ts`; equal to `ts` on the parent itself. */
  thread_ts?: string
  /** Who wrote the thread's parent — on a thread reply. */
  parent_user_id?: string
  team?: string
  bot_id?: string
  app_id?: string
  bot_profile?: SlackBotProfile
  /** Delivered on members' messages, not documented on the event's page — read when present. */
  user_profile?: SlackProfile
  edited?: { user?: string, ts?: string }
  hidden?: boolean
  /** `message_changed`: the message as it is now / as it was. */
  message?: SlackMessage
  previous_message?: SlackMessage
}

export interface SlackAppMention {
  type: 'app_mention'
  channel?: string
  user?: string
  text?: string
  ts?: string
  event_ts?: string
  thread_ts?: string
  team?: string
  bot_id?: string
  app_id?: string
}

export interface SlackAuthorization {
  enterprise_id?: string | null
  team_id?: string
  user_id?: string
  is_bot?: boolean
  is_enterprise_install?: boolean
}

/** The outer JSON of every Events API request. */
export interface SlackEnvelope {
  type: 'event_callback' | 'url_verification' | 'app_rate_limited' | string
  token?: string
  team_id?: string
  api_app_id?: string
  event?: SlackMessage | SlackAppMention | { type: string }
  event_id?: string
  event_time?: number
  authorizations?: SlackAuthorization[]
  is_ext_shared_channel?: boolean
  event_context?: string
  /** `url_verification` only. */
  challenge?: string
}

/** Every Web API answer. */
export interface SlackAnswer {
  ok: boolean
  error?: string
  warning?: string
}

export interface SlackAuthTest extends SlackAnswer {
  url?: string
  team?: string
  user?: string
  team_id?: string
  user_id?: string
  /** Present for a bot token only. */
  bot_id?: string
  enterprise_id?: string
  is_enterprise_install?: boolean
}

export interface SlackPosted extends SlackAnswer {
  channel?: string
  ts?: string
  message?: SlackMessage
}

// ─── The plugin's parts ───

export interface SlackBotPlatformOptions {
  /** The Web API, default `https://slack.com/api`; calls go to `<base>/<method>`. */
  base?: string
  /** Retries of a call answered 429, default 2. */
  retries?: number
  /** The longest `Retry-After` waited for, in seconds, default 30. */
  maxRetryWaitS?: number
}

export interface SlackRetryPolicy {
  retries: number
  maxRetryWaitS: number
}

export interface SlackCallOptions {
  /** Another token than the bot's — the admin `userToken` for `chat.delete`. */
  token?: string
  signal?: AbortSignal
  timeoutMs?: number
}

/** The Web API over a session's transport. */
export interface SlackApi {
  /**
   * POST `<base>/<method>` with a JSON body and `Authorization: Bearer <token>`; a 429 is retried
   * after its `Retry-After` (bounded). @throws {SlackApiError} `ok: false`, a transport fault
   */
  call: <T extends SlackAnswer>(method: string, params?: Record<string, unknown>, opts?: SlackCallOptions) => Promise<T>
}

export interface SlackApiFactory {
  (session: Pick<BotPlatformSession, 'connection' | 'fetch'>, base: string, retry: SlackRetryPolicy): SlackApi
}

/** The Events API request signature. */
export interface SlackSignatureHelper {
  /** `v0=` + hex HMAC-SHA256(secret, `v0:<timestamp>:<body>`). */
  sign: (secret: string, timestamp: string, body: string) => string
  /** Whether `signature` signs `body` at `timestamp` with any of `secrets` — timing-safe. */
  matches: (signature: string | undefined, timestamp: string, body: string, secrets: readonly string[]) => boolean
  /** Whether `timestamp` (seconds) is within the tolerance of `nowMs`. */
  fresh: (timestamp: string | undefined, nowMs: number) => boolean
}

/** Slack's three escaped characters in message text. */
export interface SlackTextHelper {
  /** `&amp;` `&lt;` `&gt;` → `&` `<` `>` — what a person reads. */
  decode: (text: string) => string
  /** `&` `<` `>` → entities — plain text Slack shows as written. */
  encode: (text: string) => string
}

export interface SlackNormalizer {
  /**
   * An `event_callback`'s `message` (new, or edited when it carries new text) or `app_mention` → one
   * update; system subtypes, the bot's own messages and every other payload → none.
   */
  normalize: (payload: unknown, connection: BotConnection) => BotNormalizedUpdate[]
}

/** Who the fake workspace says the fake bot is — stable per connection id. */
export interface SlackMockIdentity {
  teamId: string
  teamName: string
  appId: string
  botId: string
  botUserId: string
  username: string
  /** The admin `auth.test` answers for the connection's `userToken`. */
  adminUserId: string
}

export interface SlackMock extends BotPlatformMock {
  /** A signed `url_verification` request — what Slack posts when the Request URL is pasted. */
  challenge: (connection: BotPlatformConnection, challenge?: string) => BotNativeInbound
  /** The fake workspace, app and bot of a connection id. */
  identityOf: (connection: string) => SlackMockIdentity
}

/** One mock connection's state. */
export interface SlackMockState {
  /** The last `ts` handed out, in microseconds — every new one is later. */
  clock: number
  /** Every call, with `auth` — the token it carried (`bot`, `user` or `none`). */
  calls: BotMockCall[]
  /** The `ts` of messages the fake bot posted — a thread under one is the bot's. */
  sent: Set<string>
  /** `<channel>:<ts>:<name>` of reactions already added. */
  reactions: Set<string>
}

/** The Slack plugin, its mock typed as Slack's own. */
export interface SlackBotPlatform extends BotPlatformPlugin {
  mock: SlackMock
}
