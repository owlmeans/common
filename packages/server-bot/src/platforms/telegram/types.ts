import type { BotConnection } from '@owlmeans/bot'
import type { BotFetch, BotNormalizedUpdate, BotPlatformMock, BotPlatformSession } from '../types.js'

// ─── Native Bot API shapes (https://core.telegram.org/bots/api#available-types) — the fields used ───

export interface TelegramUser {
  id: number
  is_bot: boolean
  first_name: string
  last_name?: string
  username?: string
}

export interface TelegramChat {
  id: number
  type: 'private' | 'group' | 'supergroup' | 'channel'
  title?: string
  username?: string
  first_name?: string
  last_name?: string
  is_forum?: boolean
}

export interface TelegramMessageEntity {
  type: string
  /** UTF-16 code units — what JavaScript string indices count. */
  offset: number
  length: number
  user?: TelegramUser
}

export interface TelegramMessage {
  message_id: number
  message_thread_id?: number
  from?: TelegramUser
  sender_chat?: TelegramChat
  date: number
  edit_date?: number
  chat: TelegramChat
  text?: string
  caption?: string
  entities?: TelegramMessageEntity[]
  caption_entities?: TelegramMessageEntity[]
  reply_to_message?: TelegramMessage
  is_topic_message?: boolean
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  edited_message?: TelegramMessage
  channel_post?: TelegramMessage
  edited_channel_post?: TelegramMessage
}

/** Every Bot API answer. */
export interface TelegramEnvelope<T = unknown> {
  ok: boolean
  result?: T
  description?: string
  error_code?: number
  parameters?: { retry_after?: number, migrate_to_chat_id?: number }
}

// ─── The plugin's parts ───

export interface TelegramBotPlatformOptions {
  /** The Bot API server, default `https://api.telegram.org`; `<base>/bot<token>/<method>`. */
  base?: string
}

export interface TelegramCallOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

/** The Bot API over a session's transport. */
export interface TelegramApi {
  /** POST `<base>/bot<token>/<method>` with a JSON body. @throws {TelegramApiError} `ok: false` */
  call: <T>(method: string, params?: Record<string, unknown>, opts?: TelegramCallOptions) => Promise<T>
}

export interface TelegramApiFactory {
  (session: Pick<BotPlatformSession, 'connection' | 'fetch'>, base: string): TelegramApi
}

export interface TelegramNormalizer {
  /** `message`, `edited_message`, `channel_post`, `edited_channel_post` → one update; anything else → none. */
  normalize: (payload: unknown, connection: BotConnection) => BotNormalizedUpdate[]
}

export interface TelegramMock extends BotPlatformMock {
  /** The username the fake `getMe` answers for a connection id: `mock_<id>_bot`. */
  usernameOf: (connection: string) => string
}

/** One mock connection's state. */
export interface TelegramMockState {
  /** The next `update_id`: a random start per state, then sequential (as Telegram picks one after a quiet week). */
  nextUpdateId: number
  /** The next `message_id`, inbound and sent alike: a random start per state, then sequential. */
  nextMessageId: number
  queue: TelegramUpdate[]
  waiters: Set<() => void>
  calls: { method: string, params: Record<string, unknown>, at: string }[]
  /** Message ids the fake bot sent — a simulated reply to one is a reply to the bot. */
  sent: Set<number>
  webhook?: string
}

export type { BotFetch }
