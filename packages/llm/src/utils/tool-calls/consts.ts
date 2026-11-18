/** The text of a call that threw — the model reads it and corrects the call. */
export const TOOL_ERROR_PREFIX = 'Error during tool call: '

/** Opens the note that carries earlier look-ups to a rung that cannot take them as tool messages. */
export const CARRIED_LOOKUPS_HEADER = 'What you already looked up in an earlier attempt at this answer '
  + '(these look-ups are not run again — use what they returned):'

/** The arguments a stop tool takes when it names none. */
export const NO_ARGUMENTS_SCHEMA: Readonly<Record<string, unknown>> = Object.freeze({ type: 'object', properties: {} })
