import type { ResourceRecord } from '@owlmeans/resource'
import { type AgentRunStatus, PipelineRunStatus } from './consts.js'
import type { Inquiry } from '@owlmeans/llm-common'

/**
 * What a conversation is, as an address.
 *
 * `conversationId` is the thread a run belongs to; `scope` is the wider subject the thread is
 * about — for a project-dedicated agent the two coincide, but memory is scoped per project while
 * conversations may be finer-grained, so they are separate fields rather than one.
 */
export interface ConversationRef {
  conversationId: string
  scope: string
}

/**
 * One finished run, compacted.
 *
 * Two parts on purpose: `summary` says what happened, `advice` says what to do next. The second is
 * what an agent actually needs on the way in — a summary alone leaves the next run to re-derive
 * the plan from the outcome, which is where it invents a different one.
 *
 * Timestamps are ISO strings, never `Date`: these contracts cross process boundaries and storage
 * backends, and must survive `JSON.stringify` unchanged. A consumer whose store prefers dates maps
 * them at its own adapter boundary.
 */
export interface ConversationEvent extends ResourceRecord {
  conversationId: string
  scope: string
  /** Monotonic within a conversation, allocated by the store. */
  seq: number
  createdAt: string
  /** The ask that opened the run, truncated. Present so a reader can see what was attempted. */
  prompt?: string
  summary: string
  advice?: string
  status: AgentRunStatus
}

/** What a store is asked to append; `seq` and `id` are the store's to allocate. */
export interface ConversationEventInput extends Omit<ConversationEvent, 'id' | 'seq' | 'createdAt'> {
  createdAt?: string
}

/**
 * A node of the subsystem memory graph.
 *
 * `subsystem` is the lookup key within a scope, and `links` are the other subsystems this one
 * refers to. The graph is deliberately shallow: agents read a node and follow a link or two, they
 * do not traverse.
 */
export interface MemoryNode extends ResourceRecord {
  scope: string
  subsystem: string
  content: string
  links: string[]
  updatedAt: string
}

/** An entry in the bounded event-sequence memory. */
export interface MemoryEvent extends ResourceRecord {
  scope: string
  /** Monotonic within a scope, allocated by the store. */
  seq: number
  kind: string
  content: string
  createdAt: string
}

/** What a store is asked to append; `seq` and `id` are the store's to allocate. */
export interface MemoryEventInput extends Omit<MemoryEvent, 'id' | 'seq' | 'createdAt'> {
  createdAt?: string
}

/**
 * What a transport carries: a POINTER, never a payload.
 *
 * Everything a consumer needs to route the message is here, and everything else is read from the
 * run row it names. That is not an optimization — a pipeline state is scalars and keys precisely so
 * that the authority stays in one place, and a message that carried a copy would be a second one,
 * stale from the moment it was enqueued.
 */
export interface AgentRunMessage {
  runId: string
  conversationId: string
  /** The pipeline alias, when the message is about a pipeline run rather than a conversation. */
  pipeline?: string
  /** Where the run stood when the message was sent. Advisory — the row is authoritative. */
  step?: string
}

/**
 * What a pipeline carries between its steps.
 *
 * Scalars and KEYS — ids, revisions, markers, lists of codes. Never an artifact. Everything large a
 * pipeline produces belongs in a store of its own and travels here as the key that finds it again:
 * the state is serialized into the run row at every step boundary, and a state that carries a
 * document is a row that carries it too, once per step.
 */
// Kept as a type: every state shape must satisfy it without declaring an index signature.
export type PipelineState = Record<string, unknown>

export interface PipelineStepSpec {
  step: string
  /**
   * The steps that must have completed before this one may run.
   *
   * Absent or empty means "from the start". Several steps naming the same predecessor fan OUT;
   * one step naming several predecessors JOINS them. That is the whole edge vocabulary — there is
   * no conditional edge, because a branch that is expressed as an edge is invisible to a resume,
   * while a branch expressed as {@link PipelineStep.skipWhen} is the same mechanism that makes a
   * resume correct.
   */
  after?: string[]
  /** Human-readable, for progress reporting and tool descriptions. */
  title?: string
  /** A failure is recorded on the run's `warnings` and the successors still run. */
  optional?: boolean
  /**
   * Re-running repeats a side effect that cannot be undone — a wipe, a purge, a claim against a
   * rate-limited authority, a model call whose output is already on disk.
   *
   * A resume never re-enters one of these on its own; `resume(runId, { from })` refuses without
   * `force`. It is also refused `attempts > 1`, since an automatic retry is exactly the thing the
   * flag says must not happen.
   */
  nonIdempotent?: boolean
  /**
   * Attempts for ONE entry of this step. Default {@link DEFAULT_STEP_ATTEMPTS} = 1.
   *
   * Deliberately not a ladder: retry budgets in this family MULTIPLY (an outer 8 around a model's
   * own inner 8 is 64 real calls), so a step that wants retries asks for them once, here, and the
   * helpers below it keep theirs.
   */
  attempts?: number
  /** Wall clock for one attempt, in milliseconds. */
  timeout?: number
}

export interface PipelineSpec {
  alias: string
  /**
   * Bumped whenever a step is added, removed or renamed.
   *
   * `completed` names steps by string, so a run resumed under a changed spec would skip work it
   * never did — silently, because an unknown name simply matches nothing. A version mismatch is
   * refused instead.
   */
  version: number
  steps: PipelineStepSpec[]
}

/**
 * What a `Waiting` run is waiting for.
 *
 * Written by the runner when a step asks a question nobody could answer while it ran, and read by
 * everything that reports a run — a resume delivers the answer under {@link Inquiry.id}, which is
 * the only thing that routes it back.
 */
export interface PipelineRunInquiry {
  /** The step that asked. A resume re-enters exactly this one. */
  step: string
  askedAt: string
  inquiry: Inquiry
}

/**
 * The data plane of a pipeline run, and the ONE authority on where it stands.
 *
 * Not the LangGraph checkpoint: that is a replay optimization which may legitimately be absent (it
 * is size-guarded and expires), and a design that trusts it has a silent hole exactly where a
 * crashed run needs an answer. Everything that reads a run's position — a resume, a reconciler, an
 * operator, a status endpoint — reads this row.
 *
 * Timestamps are ISO strings, never `Date`: these records cross process boundaries and storage
 * backends. A consumer whose store prefers dates maps them at its own adapter boundary.
 */
export interface PipelineRun extends ResourceRecord {
  /** The business key. Chosen by the caller so a run is addressable before it exists. */
  runId: string
  pipeline: string
  version: number
  /** The subject the run belongs to — for an application with projects, the project id. */
  scope: string
  /** The tenant. Carried so a store can refuse a read that crosses an organization. */
  entityId?: string
  status: PipelineRunStatus
  /** Steps that have finished, in the order they finished. */
  completed: string[]
  /** Steps that had not run when the run stopped. Empty on a `Done` run. */
  pending: string[]
  /** JSON TEXT of {@link PipelineState}. Text, not a subdocument — a state key is a caller's word. */
  state: string
  stateChars: number
  /** What an `optional` step reported when it failed. Never empties a run. */
  warnings: string[]
  failedAt?: string
  error?: string
  /** The last thing a step said about itself. Progress, not state. */
  note?: string
  /**
   * The question this run stopped on.
   *
   * Present only while `status === Waiting`, and cleared on every entry of the run — a row that
   * kept advertising a question it has already been given would have every reader offer it again.
   */
  inquiry?: PipelineRunInquiry
  /** Whatever lock the run held, so a resume can re-take the same one. */
  lockTask?: string
  /** How many times this run has been RESUMED. Reset only by a `Done` outcome. */
  attempts: number
  startedAt: string
  /**
   * Written at every step boundary — the only signal that separates a run still working from one
   * whose process died. A reconciler reads staleness here, never the status.
   */
  heartbeatAt: string
  updatedAt: string
}

/** What the runner reports as it moves. Never persisted as state. */
export interface PipelineProgress {
  pipeline: string
  runId: string
  step: string
  /** 1-based position in the topological order. */
  index: number
  total: number
  skipped?: boolean
  note?: string
}
