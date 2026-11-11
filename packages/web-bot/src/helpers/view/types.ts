import type { BotCredentialField, BotPlatformDescriptor, BotPlatformId, BotTexts } from '@owlmeans/bot'

/** One manual setup step, split so its value can be copied on its own. */
export interface BotSetupLine {
  /** What the value is (`Callback URL`), or null when the step is one sentence. */
  label: string | null
  /** What a person pastes into the platform console — or the whole step. */
  value: string
}

/** How the panels read bot records and platform descriptors — exported for a host that draws its own view. */
export interface BotViewHelper {
  /**
   * The descriptors a new connection may be made on, in the server's order: those whose id is in
   * `platforms`, or every one when `platforms` is absent (or names none the server registered).
   */
  platformsOf: (descriptors: readonly BotPlatformDescriptor[], platforms?: readonly BotPlatformId[]) => BotPlatformDescriptor[]
  /** The credentials a person TYPES for a platform — a `generated` one is the server's to create. */
  typedCredentialsOf: (descriptor: BotPlatformDescriptor | null | undefined) => BotCredentialField[]
  /**
   * A descriptor's text in the reader's language: the exact code, then its base language (`pt` for
   * `pt-BR`), then `BOT_TEXT_FALLBACK_LANGUAGE`, then `fallback` (default `''`).
   */
  textOf: (texts: BotTexts | null | undefined, lng?: string, fallback?: string) => string
  /**
   * A descriptor's pre-save link filled in — each `{key}` from the typed value, else (a param with
   * `identity`) the verified bot account's id, URL-encoded — or null when the platform has no link
   * or a value is missing or does not match its param's pattern.
   */
  linkOf: (
    descriptor: BotPlatformDescriptor | null | undefined, values: Readonly<Record<string, string | undefined>>,
    identity?: string | null
  ) => string | null
  /** A moment in the reader's own language, or null when there is none (or it does not parse). */
  formatMoment: (value: string | null | undefined, lng?: string) => string | null
  /** A message cut to `max` characters on one line, with an ellipsis when it was cut. */
  excerpt: (text: string | null | undefined, max?: number) => string
  /** `Callback URL: https://…` → `{ label: 'Callback URL', value: 'https://…' }`. */
  setupLineOf: (step: string) => BotSetupLine
}
