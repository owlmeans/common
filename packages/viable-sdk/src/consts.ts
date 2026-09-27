import { CONNECT_DEFAULT_MCP_URL, CONNECT_ENV_MCP_URL } from '@owlmeans/viable-common'

/** Where the connector reads its configuration from. Only the token is a secret. */
export const ENV_TOKEN = 'VIABLE_API_TOKEN'
export const ENV_API_URL = 'VIABLE_API_URL'
export const ENV_TARGET = 'VIABLE_TARGET'
export const ENV_LLM = 'VIABLE_LLM'
export const ENV_HARNESS = 'VIABLE_HARNESS'
export const ENV_PROJECT_DIR = 'VIABLE_PROJECT_DIR'
/** The URL-configured MCP host's address — see `CONNECT_DEFAULT_MCP_URL`. */
export const ENV_MCP_URL = CONNECT_ENV_MCP_URL
export const DEFAULT_MCP_URL = CONNECT_DEFAULT_MCP_URL

/**
 * The `/mcp` URL a person, a doc or a verification tool should use: the value the merged
 * configuration names (environment over `~/.owlmeans`, already resolved by the caller), else the
 * production default. An empty value counts as unset, and a trailing slash is dropped — a
 * canonical resource URI (RFC 8707) has one spelling.
 */
export const resolveMcpUrl = (values: Record<string, string | undefined>): string => {
  const named = values[ENV_MCP_URL]

  return (named != null && named !== '' ? named : DEFAULT_MCP_URL).replace(/\/+$/, '')
}

/** The service alias the SDK's own client context registers under. */
export const SDK_SERVICE = 'viable-sdk'

/**
 * The longest any tool may take to answer.
 *
 * Every MCP host bounds a tool call, and the strictest default in the field is sixty seconds
 * (Codex). Forty-five leaves room for the round trip and keeps the connector inside every host's
 * ceiling without configuration — long operations return a domain status and continue server-side.
 */
export const TOOL_DEADLINE_MS = 45_000

/**
 * How long a story tool waits for its planning transition to COMMIT, in milliseconds.
 *
 * Well under {@link TOOL_DEADLINE_MS}: the same call has already resolved the story and posted the
 * transition, and on the platform a person's narrative is re-formatted by a model before it is
 * appended. A commit that is late is not a failure — the transition is durable and nothing is
 * undone — so `develop_story` answers from the story status instead of waiting out the host's ceiling.
 */
export const COMMIT_WAIT_MS = 20_000

/** How long one long poll of a commit may hold, in seconds — what the platform holds at most for a connector. */
export const COMMIT_POLL_SEC = 20

/** How many stories one page of `list_stories` carries when the caller names no size. */
export const STORY_PAGE_SIZE = 25

/** How long `next_task` waits before answering "nothing yet". Under every host's ceiling. */
export const NEXT_TASK_WAIT_MS = 30_000

/**
 * How long `next_question` waits before answering "nothing yet".
 *
 * The same window as a model task's, and for the host's reasons rather than the person's: nobody
 * is expected to answer inside it. What the wait buys is a parent that asked one call too early —
 * the platform queues the question a moment after the domain status reported it — and what the ceiling buys
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
