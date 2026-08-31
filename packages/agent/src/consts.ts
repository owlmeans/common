export { AGENTS_SERVICE } from '@owlmeans/agent-common'

/** Default LangGraph entrypoint name. Shows up in traces, so it is worth overriding per agent. */
export const DEFAULT_ENTRYPOINT = 'owlmeans-agent'

/** Default action label for a model call, used as the LangChain `runName`. */
export const DEFAULT_ACTION = 'agent-ask'

/**
 * How many tool rounds one run may take before it is stopped.
 *
 * A model that keeps calling tools without ever answering is not rare — it is the ordinary failure
 * mode of a loop whose tool results do not satisfy it. Without a ceiling the run consumes the
 * caller's budget until something else kills it, which reads as a hang rather than a refusal.
 */
export const DEFAULT_MAX_TURNS = 64

/** Ordering weight of a plugin that declares none. */
export const DEFAULT_PLUGIN_ORDER = 50
