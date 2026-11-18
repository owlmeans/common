/** The turn after the last look round: the model answers with what it has. */
export const TOOL_ROUNDS_SPENT = 'Your look-up budget for this answer is spent: answer now with what you have. '
  + 'No further look-up will run.'

/** The answer to a look-up asked for after the budget was spent. */
export const TOOL_CALL_NOT_RUN = 'Not run: the look-up budget for this answer is spent. Answer now.'

/** The answer to a stop call in a conversation handed back for continuation. */
export const STOP_TOOL_ACCEPTED = 'Accepted: this ended the call.'

/**
 * Opens the note `ask`'s answering turn carries instead of its rounds: that turn binds no tools, so no
 * provider is handed tool messages without the tools they answer.
 */
export const TOOL_ROUNDS_NOTE_HEADER = 'What you looked up for this answer (no further look-up will run — use what they returned):'

/**
 * How many times a turn that may no longer look — `ask`'s tool-less answer, `invoke`'s pinned output
 * turn — is asked again within the attempt when it answers with look calls only.
 */
export const FINAL_TURN_REASKS = 1

/**
 * What `invoke` is told when a turn answered in words instead of calling its output tool — a provider
 * that ignores a forced "any tool" choice lets the model do that. The next turn pins the output tool by
 * name, which every provider honours; asked at most {@link FINAL_TURN_REASKS} times per attempt.
 */
export const OUTPUT_TOOL_REQUIRED = (toolName: string): string =>
  `Your answer must be given by calling the \`${toolName}\` tool with the result — not as text. Call it now.`
