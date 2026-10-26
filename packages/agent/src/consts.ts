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

/**
 * What a tool call the loop did not run is answered with, once the person stopped the run. Every
 * call of an answer needs a result before the model is asked again, and this one says why there is
 * none.
 */
export const AGENT_STOPPED_TOOL_RESULT = 'not run — the person stopped the run'

/** The instruction appended, as the person's turn, before the one summary call of a stopped run. */
export const AGENT_STOP_INSTRUCTION = 'The person stopped you. Do not call any tools. Say briefly '
  + 'what you changed and what is left undone.'

/** How long the summary call of a stopped run may take. It gets no stop signal of its own. */
export const AGENT_STOP_SUMMARY_TIMEOUT_MS = 120_000

/** The note a stopped run is finalized with when the agent finalizes it itself (`autoFinish`). */
export const AGENT_STOPPED_NOTE = 'Stopped by the person.'

/** What opens the turn that carries the person's messages, drained from the inbox mid-run. */
export const AGENT_INBOX_PREFIX = 'Message from the person while you work:'
