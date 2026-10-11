/**
 * Appended to the prompt of `invoke`/`request` on a model that refuses a pinned tool: with
 * `tool_choice: auto` the instruction is what asks for the call. Generic on purpose — it names
 * only the tool.
 */
export const toolCallInstruction = (toolName: string): string =>
  `Answer by calling the tool \`${toolName}\` with the complete result as its input. Do not reply in text.`
