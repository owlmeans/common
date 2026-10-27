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
  /**
   * An opaque reference every action records on its activity (`{ ref }`) — the id of the
   * application's own record the handler followed (the keyword group the message matched).
   */
  ref?: string
}

export interface BotAgentOptions extends BotAgentToolsOptions {
  /**
   * What the model is told for this message: the instructions of the application's keyword groups
   * the message matched (the handler matches them and passes them here), or one instruction of the
   * product's own. Absent or blank: the context is the message alone.
   */
  instruction?: string | readonly string[]
}
