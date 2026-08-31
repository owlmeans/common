import type { ResourceRecord } from '@owlmeans/resource'
import type { ExecutionState } from '@owlmeans/llm-common'
import type { AgentRunStatus } from './consts.js'

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
 * The data plane of a run.
 *
 * `flow` is the serialized {@link import('@owlmeans/flow').FlowModel} state — the control plane
 * collapsed to a string — and `state` is the execution snapshot the LLM layer produces. Keeping
 * them in one record is what makes a resume a single read.
 */
export interface AgentRunState extends ResourceRecord {
  id: string
  conversationId: string
  flow: string
  state: ExecutionState
  updatedAt: string
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
 * What a transport carries.
 *
 * The execution state travels by REFERENCE (`stateRef`), not by value: a project execution's state
 * holds the whole project specification, and a queue whose messages carry that is a queue that
 * falls over on the first large project. The flow string is small enough to inline, and it is what
 * a consumer needs to route the message before it reads anything.
 */
export interface AgentRunMessage {
  id: string
  conversationId: string
  flow: string
  stateRef?: string
}
