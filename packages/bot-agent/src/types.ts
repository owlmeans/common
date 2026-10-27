import type { BotActionKind, BotUpdate } from '@owlmeans/bot'
import type { BotActions } from '@owlmeans/server-bot'

export interface BotAgentToolsOptions {
  /** The update the tools act on: its message, its sender, its chat. */
  update: BotUpdate
  /**
   * The connection's actions — the `bot` a handler receives, or `BotService.actions(update)`. They
   * never throw: every call answers `{ ok, error? }` and records one activity.
   */
  bot: BotActions
  /**
   * What the model may do (`warn` is `reply`); default every action a tool performs. Intersected
   * with `bot.supports(kind)`: a tool the platform cannot perform is never offered.
   */
  allow?: readonly BotActionKind[]
}

export interface BotAgentOptions extends BotAgentToolsOptions {
  /** One more instruction, contributed after the matched groups' — the product's own rule for this agent. */
  instruction?: string
}
