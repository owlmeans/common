/**
 * The agent service alias.
 *
 * Deliberately plural, and deliberately not `agent`: a consuming application very often already
 * has a service of its own called that (the viable platform's Kubernetes-facing `AgentService` is
 * registered under `agent`), and a context accessor collision is silent — the second registration
 * simply wins and every later lookup resolves the wrong service.
 */
export const AGENTS_SERVICE = 'agents'

/**
 * Port names.
 *
 * These are the keys a consumer binds its own storage under; the package never names a storage
 * technology. A port left unbound is not an error — the plugin that needs it degrades to a no-op,
 * the same way `ExecutionService.checkpoint` does with no plugin registered.
 */
export const AGENT_CONVERSATION_STORE = 'agent-conversation-store'
export const AGENT_RUN_STATE_STORE = 'agent-run-state-store'
export const AGENT_MEMORY_GRAPH_STORE = 'agent-memory-graph-store'
export const AGENT_MEMORY_EVENTS_STORE = 'agent-memory-events-store'

/** The lifecycle flow every agent run is driven through. */
export const AGENT_RUN_FLOW = 'agent-run'

/**
 * The steps of {@link AGENT_RUN_FLOW}.
 *
 * These are recoverable LIFECYCLE stages, not conversational turns. A ReAct loop's turn count is
 * unbounded and its messages are not scalars, while `FlowPayload` holds flat scalars only — so the
 * loop lives inside `Working` and only its counter travels in the payload. What the steps buy is
 * the ability to say where a crashed run has to resume: at `Working` from the last checkpoint, or
 * at `Finalizing` when the loop finished but the compaction never committed.
 */
export enum AgentRunStep {
  Received = 'received',
  Prepared = 'prepared',
  Working = 'working',
  Finalizing = 'finalizing',
  Finished = 'finished',
  Failed = 'failed',
}

/** The transitions of {@link AGENT_RUN_FLOW}. */
export enum AgentRunTransition {
  Prepare = 'prepare',
  Work = 'work',
  Finalize = 'finalize',
  Finish = 'finish',
  Fail = 'fail',
  Resume = 'resume',
}

/** How a run ended. Written on the conversation event so a reader can weigh the advice. */
export enum AgentRunStatus {
  Ok = 'ok',
  Failed = 'failed',
}

/**
 * Default caps.
 *
 * Every one of them is enforced by truncation after the model answers, never by asking the model
 * to obey a limit. A cap in a prompt is a request; a cap in code is a cap.
 */
export const DEFAULT_SUMMARY_CHARS = 1200
export const DEFAULT_ADVICE_CHARS = 400
export const DEFAULT_EVENT_WINDOW = 3
export const DEFAULT_MEMORY_NODE_CHARS = 2000
export const DEFAULT_MEMORY_EVENTS_LIMIT = 50

/** Separator between a dedication's kind and its target — `project:<id>`. */
export const SCOPE_SEP = ':'
