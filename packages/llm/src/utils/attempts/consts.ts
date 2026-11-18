/** The `LlmRetryExceededError` message of a call ended by a schema refusal repeated on its last rung. */
export const REPEATED_REFUSAL = 'repeated-refusal'

/** The `stopped` notice of a repeated schema refusal that moved the call to its next rung. */
export const STOP_NEXT_RUNG = 'next-rung'

/** The `stopped` notice of a repeated schema refusal on the last rung — the call ends. */
export const STOP_LAST_RUNG = 'last-rung'
