import type { BotUpdate } from '@owlmeans/bot'

/** Turning a bot update into what an agent — or a single model call — is told. Pure; never throws. */
export interface BotAgentHelper {
  /**
   * The instruction text: one instruction, or several (the instructions of the application's
   * keyword groups the message matched, in the order the handler passes them) — each trimmed,
   * empties and repeats dropped, joined by a blank line. `''` when there is none. For a caller that
   * asks ONE model call (no tools) and needs the owner's guidance as a single text.
   */
  instructionOf: (instruction?: string | readonly string[]) => string
  /**
   * The context `botAgentPlugin` contributes, one markdown block each: the message (platform, chat,
   * sender, text quoted as data, the replied-to text) and, when `instruction` holds any text, the
   * instruction block (`# Instruction`, `instructionOf(instruction)`).
   */
  contextOf: (update: BotUpdate, instruction?: string | readonly string[]) => string[]
  /** The opening turn to invoke the agent with: act on the message as the context instructs, through the tools. */
  promptOf: (update: BotUpdate) => string
}
