import type { BotActivity, BotConnection, BotConnectionInput, BotPlatform, BotProtocols } from '@owlmeans/bot'

/**
 * The managing protocol tree a screen works with — `appProtocols.api.bot.operator` or `.member`.
 *
 * It must be client-bound in the application's context (`bindAll` over the api tree does it): the
 * hooks address every leaf as `context.entrypoint(surface.<leaf>)`.
 */
export type BotSurface = BotProtocols

/**
 * What one operation ended in. An operation never throws: a refusal is `{ ok: false, error }`,
 * so the place that started it — a dialog, a row — shows it where the person is looking.
 */
export interface BotOutcome<T> {
  ok: boolean
  value?: T
  error?: Error
}

export interface UseBotConnections {
  items: BotConnection[]
  /** True while a read the person waits for is outstanding (never for a background refresh). */
  loading: boolean
  /** The last failed READ; an operation's own failure is in its outcome. */
  error: Error | null
  reload: () => Promise<void>
  /** Create (no `id`) or change one. Credentials are write-only: an omitted key keeps its value. */
  save: (input: BotConnectionInput) => Promise<BotOutcome<BotConnection>>
  /** Ask the platform who the bot is; the answer carries the identity or the failure. */
  verify: (id: string) => Promise<BotOutcome<BotConnection>>
  remove: (id: string) => Promise<BotOutcome<string>>
}

export interface BotActivityOptions {
  connection?: string
  /** 1 … `BOT_ACTIVITY_LIMIT_MAX`; the server's default when absent. */
  limit?: number
  /** Read again every so many milliseconds while the page is visible; `0` turns it off. */
  refreshMs?: number
}

export interface UseBotActivity {
  /** Newest first. */
  items: BotActivity[]
  loading: boolean
  error: Error | null
  reload: () => Promise<void>
}

export interface BotConnectionsPanelProps {
  surface: BotSurface
  /** The platforms a new connection may be made on; all four when absent. */
  platforms?: BotPlatform[]
  className?: string
}

/**
 * What a row names for an activity's `ref` — the application's own record the acting handler
 * followed (its keyword group, say). `undefined` draws nothing for that row.
 */
export interface BotRefLabel {
  (ref: string): string | undefined
}

export interface BotActivityPanelProps {
  surface: BotSurface
  connection?: string
  /** Names a row's `ref` (e.g. the keyword group's name); without it no row shows its ref. */
  refLabel?: BotRefLabel
  className?: string
}

/**
 * Which copy explains an error — the `BotError` marker of `@owlmeans/bot`'s refusals and of
 * `@owlmeans/server-bot`'s own, `platform-refused` for every platform API error (Telegram, WhatsApp,
 * Discord and its gateway, Slack), or `bot` / `generic` when there is none.
 */
export type BotErrorKey =
  | 'connection-not-found' | 'credentials-rejected' | 'signature-rejected' | 'transport-mismatch'
  | 'unsupported-action' | 'connection-disabled' | 'secret-missing' | 'credentials-unreadable'
  | 'platform-refused' | 'bot' | 'generic'
