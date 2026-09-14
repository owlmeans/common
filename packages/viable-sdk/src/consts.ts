/** Where the connector reads its configuration from. Only the token is a secret. */
export const ENV_TOKEN = 'VIABLE_API_TOKEN'
export const ENV_API_URL = 'VIABLE_API_URL'
export const ENV_TARGET = 'VIABLE_TARGET'
export const ENV_LLM = 'VIABLE_LLM'
export const ENV_HARNESS = 'VIABLE_HARNESS'
export const ENV_PROJECT_DIR = 'VIABLE_PROJECT_DIR'

/** The service alias the SDK's own client context registers under. */
export const SDK_SERVICE = 'viable-sdk'

/**
 * The longest any tool may take to answer.
 *
 * Every MCP host bounds a tool call, and the strictest default in the field is sixty seconds
 * (Codex). Forty-five leaves room for the round trip and keeps the connector inside every host's
 * ceiling without configuration — which is why long operations are JOBS that return at once and
 * are polled, rather than calls that block.
 */
export const TOOL_DEADLINE_MS = 45_000

/**
 * The longest a job poll may hold its answer, in seconds.
 *
 * Strictly under {@link TOOL_DEADLINE_MS}, with room for the round trip. Set equal to it, a poll
 * that used its whole window lost the race with its own deadline every time — and the tool's own
 * "call this next" line suggested exactly that value, so an agent following the instructions it
 * was given failed on every poll that ran the full window.
 */
export const JOB_POLL_MAX_SEC = 30

/** How long `next_task` waits before answering "nothing yet". Under every host's ceiling. */
export const NEXT_TASK_WAIT_MS = 30_000

/**
 * How long `next_question` waits before answering "nothing yet".
 *
 * The same window as a model task's, and for the host's reasons rather than the person's: nobody
 * is expected to answer inside it. What the wait buys is a parent that asked one call too early —
 * the platform queues the question a moment after the job reported it — and what the ceiling buys
 * is that the call returns before the host's own deadline turns it into a broken server.
 */
export const NEXT_QUESTION_WAIT_MS = 30_000

/** How long a pull waits for an operation before answering empty. */
export const PULL_WAIT_MS = 30_000

/** How often a socket says it is still there. Presence outlives three missed pings. */
export const PING_INTERVAL_MS = 30_000

/** How long the socket handshake may take before the connector falls back to polling. */
export const SOCKET_HANDSHAKE_MS = 10_000

/** Reconnection backoff, in order. The last entry repeats. */
export const RECONNECT_BACKOFF_MS = [1_000, 2_000, 5_000, 10_000, 30_000]
