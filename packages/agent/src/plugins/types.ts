import type { Inquiry, InquiryAnswer } from '@owlmeans/llm-common'
import type { AgentRun } from '../types.js'
import type { MemoryEvent, MemoryNode, ConversationEvent } from '@owlmeans/agent-common'
import type { MemoryEventStore, MemoryGraphStore, ConversationStore } from '../stores/types.js'
import type { LlmModel } from '@owlmeans/llm'

export interface InquiryPluginOptions {
  /**
   * How a question reaches a person.
   *
   * `null` answers "nobody is there", which the tool reports to the model as something it must
   * decide itself. Absent means there is no channel at all, and then the tool is not offered:
   * a tool nobody can serve is one the model tries once and remembers as broken.
   */
  ask?: (inquiry: Inquiry, run: AgentRun) => Promise<InquiryAnswer | null>
  /** How question ids are minted. They are what routes an answer back. */
  idOf?: () => string
  name?: string
  /** Whether the Context block explains when the tool may be used. Default `true`. */
  instruct?: boolean
  maxOptions?: number
  maxAnswerChars?: number
}

export interface MemoryEventsApi {
  append: (scope: string, kind: string, content: string) => Promise<MemoryEvent>
  /** Newest first. */
  read: (scope: string, limit?: number) => Promise<MemoryEvent[]>
}

export interface MemoryEventsOptions {
  store?: MemoryEventStore
  scope?: (run: AgentRun) => string
  /** How many events a scope keeps. Older ones are dropped on append. */
  limit?: number
  /** How many events are put back into the prompt. */
  window?: number
  /** Cap on a single entry. */
  maxEventChars?: number
  tools?: boolean
}

export interface MemoryGraphApi {
  /** Subsystem names and their links, without content. */
  index: (scope: string) => Promise<Array<Pick<MemoryNode, 'subsystem' | 'links' | 'updatedAt'>>>
  /** One node, plus the nodes it links to, `follow` hops deep. */
  read: (scope: string, subsystem: string, follow?: number) => Promise<MemoryNode[]>
  /** Merge `content` into a node, compacting when it outgrows its budget. */
  write: (scope: string, subsystem: string, content: string, links?: string[]) => Promise<MemoryNode>
}

export interface MemoryGraphOptions {
  store?: MemoryGraphStore
  /** Which knowledge base a run reads and writes. Defaults to the conversation's scope. */
  scope?: (run: AgentRun) => string
  /** The model used to compact an overgrown node. Without one, compaction is truncation. */
  model?: (run: AgentRun) => LlmModel | undefined
  maxNodeChars?: number
  /** Contribute the read/write tools. On by default. */
  tools?: boolean
  /** Contribute the index to the prompt. On by default. */
  injectIndex?: boolean
  action?: string
}

export interface SummarizeOptions {
  /** Where compactions live. Unbound is not an error — the plugin becomes a no-op. */
  store?: ConversationStore
  /**
   * The model the compaction is written with, resolved per run.
   *
   * A resolver rather than a model, because which model is cheap enough for bookkeeping is the
   * application's policy, and it may depend on the execution the run belongs to.
   */
  model?: (run: AgentRun) => LlmModel | undefined
  maxSummaryChars?: number
  maxAdviceChars?: number
  /** How many past events to put back into the prompt. */
  window?: number
  /**
   * LangChain `runName` for the compaction call.
   *
   * Give it a value the application filters out of whatever it shows the user. Every model call
   * carrying a purpose is streamed to the client, so without this the summary of a run types
   * itself out in the user's view of that run, immediately after it finished.
   */
  action?: string
  /** Called with the stored event — the seam an application folds it into a wider history through. */
  onEvent?: (event: ConversationEvent, run: AgentRun) => Promise<void>
}
