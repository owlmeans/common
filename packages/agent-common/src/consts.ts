import type { ShallowFlow } from '@owlmeans/flow'

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
export const AGENT_MEMORY_GRAPH_STORE = 'agent-memory-graph-store'
export const AGENT_MEMORY_EVENTS_STORE = 'agent-memory-events-store'
export const AGENT_PIPELINE_RUN_STORE = 'agent-pipeline-run-store'
export const AGENT_CHECKPOINT_STORE = 'agent-checkpoint-store'
export const AGENT_CUMULATIVE_RESULT_STORE = 'agent-cumulative-result-store'

/**
 * Caps and defaults for cumulative pipeline results.
 *
 * Every one of them bounds what a later step is TOLD, never what a step may produce: a fact that
 * does not fit is left out of one view, and it is still on its entry for the next view and for any
 * code that queries it. `DEFAULT_RESULTS_WINDOW` is a distance in the step graph — a consumer that
 * many edges or fewer after a producer gets the producer's full entry; anything further back gets
 * its names only, unless the producer names the consumer outright.
 */
export const DEFAULT_RESULTS_MAX_CHARS = 12_000
export const DEFAULT_RESULT_ENTRY_CHARS = 4_000
export const DEFAULT_RESULT_COMPACT_CHARS = 400
export const DEFAULT_RESULTS_WINDOW = 2
export const DEFAULT_RESULT_SUMMARY_CHARS = 600

/** The consumer wildcard: every later step of the pipeline — and of anything it is composed into. */
export const RESULTS_EVERY_STEP = '*'

/**
 * Caps and defaults for a pipeline run.
 *
 * `DEFAULT_MAX_STATE_CHARS` is generous by the standard of what a state may legally hold — scalars
 * and keys — and deliberately so: it is a TRIPWIRE, not a budget. A state approaching it is a state
 * carrying an artifact, and the step fails so that fact is discovered on the first run rather than
 * surviving as a row nobody can read back.
 *
 * `DEFAULT_STEP_ATTEMPTS` is 1 because retry budgets in this family multiply: an outer retry around
 * a model's own inner retry is their product, not their sum.
 */
export const DEFAULT_MAX_STATE_CHARS = 256_000
export const DEFAULT_STEP_ATTEMPTS = 1
export const DEFAULT_STEP_TIMEOUT = 1_800_000

/**
 * Where a pipeline's answers live in its state.
 *
 * One key, named here rather than per pipeline, because an answer has to survive every hop it can
 * take: a resume merges answers into it, a composing step forwards it to its child, and a reader
 * looks a question up by id. Scalars and keys, like everything else a state holds — the answer's
 * decision travels here and its prose belongs wherever that pipeline keeps its documents.
 */
export const INQUIRY_ANSWERS_KEY = 'answers'

/** The lifecycle flow every agent run is driven through. */
export const AGENT_RUN_FLOW = 'agent-run'

/**
 * The steps of {@link AGENT_RUN_FLOW}.
 *
 * These are recoverable LIFECYCLE stages, not conversational turns. A ReAct loop's turn count is
 * unbounded and its messages are not scalars, while `FlowPayload` holds flat scalars only — so the
 * loop lives inside `Working` and only its counter travels in the payload. What the steps buy is
 * the ability to say how far a run got when it ended, which is what a plugin reads on `onFinish`.
 *
 * Nothing RESUMES one of these. A ReAct run is not a resumable unit: its state is an unbounded
 * message list whose tool results are side effects already applied to the world, so re-entering it
 * would re-apply them. Resumable work is a PIPELINE — see `pipeline.ts` — whose steps are named,
 * whose state is scalars, and whose side effects are guarded per step.
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

/** How a run ended, or that it has not. */
export enum PipelineRunStatus {
  Running = 'running',
  Done = 'done',
  Failed = 'failed',
  /** Stopped on purpose with work left — a budget expired, or the caller asked. Resumable. */
  Aborted = 'aborted',
  /**
   * Stopped on purpose, waiting for an answer to {@link PipelineRun.inquiry}.
   *
   * Resumable, and NOT stale: a waiting run has no process behind it and its `heartbeatAt` will not
   * move again until somebody answers. A reconciler that reads staleness alone would take this for
   * a crashed run and repair what is merely waiting.
   */
  Waiting = 'waiting',
}

/** Where the facts of an entry came from. */
export enum CumulativeResultSource {
  /** Read by code from what the step left behind, when the step finished. */
  Extracted = 'extracted',
  /**
   * Read by code from the step's DURABLE inputs, after the fact — on a resume that found no stored
   * entry, or for a step whose guard skipped it. The same facts an extraction would have found.
   */
  Rebuilt = 'rebuilt',
  /** Supplied before any step of the run ran — the caller already knew them. */
  Seeded = 'seeded',
  /** No facts at all; only a model's summary, which nothing has checked. */
  Summarized = 'summarized',
}

/** How one entry appears in a view cut for a given step. */
export enum ResultViewMode {
  Full = 'full',
  /** Names only, grouped by kind. */
  Compact = 'compact',
  /** Not in the prompt. Still answered by a programmatic facts query. */
  Omitted = 'omitted',
}

/**
 * Kinds an extractor is encouraged to use. `CumulativeResultFact.kind` is an open string — declare
 * your own — but two extractors naming the same thing differently split one fact into two.
 */
export enum CumulativeFactKind {
  Type = 'type',
  Symbol = 'symbol',
  Endpoint = 'endpoint',
  Resource = 'resource',
  File = 'file',
}

/**
 * The lifecycle of one agent run.
 *
 * Read it as "how far did this run get", not "what did it say". Everything conversational happens
 * inside `Working`; the steps exist so a plugin reading `onFinish` can say where a run ended.
 * `Fail` is reachable from every working step and is TERMINAL — see the note on that step.
 *
 * `service` is left as the flow name on every step. A flow step normally binds to a service or an
 * entrypoint, but an agent run is driven by whoever holds the model — there is no second party to
 * hand control to, and inventing one would put a name in the serialized state that nothing
 * resolves.
 *
 * Each working step keeps exactly ONE non-explicit outgoing transition, so `FlowModel.next()`
 * always has an unambiguous answer: that is what lets a driver advance the run without knowing the
 * vocabulary. `Fail` is marked explicit precisely so it never becomes that automatic answer.
 */
export const agentRunFlow: ShallowFlow = {
  flow: AGENT_RUN_FLOW,
  initialStep: AgentRunStep.Received,

  steps: {
    [AgentRunStep.Received]: {
      index: 0,
      step: AgentRunStep.Received,
      service: AGENT_RUN_FLOW,
      initial: true,
      transitions: {
        [AgentRunTransition.Prepare]: {
          transition: AgentRunTransition.Prepare,
          step: AgentRunStep.Prepared,
        },
        [AgentRunTransition.Fail]: {
          transition: AgentRunTransition.Fail,
          step: AgentRunStep.Failed,
          explicit: true,
        },
      },
    },

    [AgentRunStep.Prepared]: {
      index: 1,
      step: AgentRunStep.Prepared,
      service: AGENT_RUN_FLOW,
      transitions: {
        [AgentRunTransition.Work]: {
          transition: AgentRunTransition.Work,
          step: AgentRunStep.Working,
        },
        [AgentRunTransition.Fail]: {
          transition: AgentRunTransition.Fail,
          step: AgentRunStep.Failed,
          explicit: true,
        },
      },
    },

    [AgentRunStep.Working]: {
      index: 2,
      step: AgentRunStep.Working,
      service: AGENT_RUN_FLOW,
      transitions: {
        [AgentRunTransition.Finalize]: {
          transition: AgentRunTransition.Finalize,
          step: AgentRunStep.Finalizing,
        },
        [AgentRunTransition.Fail]: {
          transition: AgentRunTransition.Fail,
          step: AgentRunStep.Failed,
          explicit: true,
        },
      },
    },

    [AgentRunStep.Finalizing]: {
      index: 3,
      step: AgentRunStep.Finalizing,
      service: AGENT_RUN_FLOW,
      transitions: {
        [AgentRunTransition.Finish]: {
          transition: AgentRunTransition.Finish,
          step: AgentRunStep.Finished,
        },
        [AgentRunTransition.Fail]: {
          transition: AgentRunTransition.Fail,
          step: AgentRunStep.Failed,
          explicit: true,
        },
      },
    },

    [AgentRunStep.Finished]: {
      index: 4,
      step: AgentRunStep.Finished,
      service: AGENT_RUN_FLOW,
      transitions: {},
    },

    [AgentRunStep.Failed]: {
      index: 5,
      step: AgentRunStep.Failed,
      service: AGENT_RUN_FLOW,
      // Terminal. Nothing resumes a ReAct run — its tool results are side effects already applied
      // to the world, so re-entering it re-applies them. Resumable work is a pipeline.
      transitions: {},
    },
  },
}

/** Every flow this package declares, for a provider to serve. */
export const agentFlows: ShallowFlow[] = [agentRunFlow]
