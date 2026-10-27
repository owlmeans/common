import type { BotUpdate } from '@owlmeans/bot'

/** Turning a bot update into what an agent — or a single model call — is told. Pure; never throws. */
export interface BotAgentHelper {
  /**
   * The matched groups' instructions, in match order — trimmed, empties and repeats dropped — then
   * `extra`; joined by a blank line. `''` when there is none. For a caller that asks ONE model call
   * (no tools) and needs the owner's guidance as a single text.
   */
  instructionOf: (update: BotUpdate, extra?: string) => string
  /**
   * The context `botAgentPlugin` contributes, one markdown block each: the message (platform, chat,
   * sender, text quoted as data, the replied-to text), the matched keyword groups (name, matched
   * keywords, action, fixed reply, instruction) and, when given, `instruction`.
   */
  contextOf: (update: BotUpdate, instruction?: string) => string[]
  /** The opening turn to invoke the agent with: act on the message as the context instructs, through the tools. */
  promptOf: (update: BotUpdate) => string
}
