/**
 * How long a tool waits on an attended platform call before it answers that the call goes on — well
 * inside the tool deadline (`TOOL_DEADLINE_MS`), so the answer is the tool's, never the host's timeout.
 */
export const ATTEND_ANSWER_MS = 38_000

/**
 * How long a settled call nobody was told about is answered to an identical repeat. Past it the same
 * arguments ask the platform again — a person repeating a request later means a new one.
 */
export const ATTEND_REJOIN_MS = 15 * 60_000
