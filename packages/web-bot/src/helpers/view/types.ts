import type { BotCredentialField, BotPlatform, BotRule, BotRuleInput } from '@owlmeans/bot'

/** One manual setup step, split so its value can be copied on its own. */
export interface BotSetupLine {
  /** What the value is (`Callback URL`), or null when the step is one sentence. */
  label: string | null
  /** What a person pastes into the platform console — or the whole step. */
  value: string
}

/** How the panels read bot records — exported for a host that draws its own view. */
export interface BotViewHelper {
  /**
   * The platforms a new connection may be made on, in the descriptor table's order: the given ones
   * that exist, or all four when none is given (or none of the given ones exists).
   */
  platformsOf: (platforms?: readonly BotPlatform[]) => BotPlatform[]
  /** The credentials a person TYPES for a platform — a `generated` one is the server's to create. */
  typedCredentialsOf: (platform: BotPlatform) => BotCredentialField[]
  /** Groups in the order the bot applies them (`order`, ties by name). */
  orderRules: (rules: readonly BotRule[]) => BotRule[]
  /** A stored group as the write that would store it again — what a one-field change starts from. */
  ruleInputOf: (rule: BotRule) => BotRuleInput
  /** The next free `order` after the given groups. */
  nextOrder: (rules: readonly BotRule[]) => number
  /** A moment in the reader's own language, or null when there is none (or it does not parse). */
  formatMoment: (value: string | null | undefined, lng?: string) => string | null
  /** A message cut to `max` characters on one line, with an ellipsis when it was cut. */
  excerpt: (text: string | null | undefined, max?: number) => string
  /** `Callback URL: https://…` → `{ label: 'Callback URL', value: 'https://…' }`. */
  setupLineOf: (step: string) => BotSetupLine
  /** The link that invites a Discord bot with the permissions its actions need, or null without an id. */
  discordInviteUrl: (applicationId: string | null | undefined) => string | null
  /** A comma-, semicolon- or newline-separated list, trimmed, empties dropped. */
  splitKeywords: (text: string) => string[]
}
