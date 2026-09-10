/**
 * The placeholder credential a delegated config carries.
 *
 * The model factory refuses a config with no secret, because for every other provider that means a
 * deployment forgot one. A delegated model authenticates nothing — the performer is on the other
 * end of a transport the application seated — so it carries a value that is visibly not a secret
 * rather than a special case in the factory.
 */
export const DELEGATED_SECRET = 'delegated'

/** The model-id prefix a delegated config uses: `delegated:<tier>`. */
export const DELEGATED_MODEL_PREFIX = 'delegated:'

/** What the model reports as its type to langchain. */
export const DELEGATED_LLM_TYPE = 'delegated'

/**
 * How long one delegated call may take before the model gives up on it.
 *
 * Forty-five minutes, because the performer is a person's coding agent: a subagent on a large
 * refactor, a rate-limited provider, somebody who walked away mid-turn. The bound exists so a dead
 * performer eventually fails the call rather than holding a run open forever — not to pace a
 * working one. A transport with its own deadline is free to be stricter.
 */
export const DELEGATED_TIMEOUT_MS = 2_700_000
