/** What a tool's arguments may hold — read defensively: a provider may send anything. */
export interface BotAgentToolArgs {
  text?: unknown
  minutes?: unknown
  emoji?: unknown
}
