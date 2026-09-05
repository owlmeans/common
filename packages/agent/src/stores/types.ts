import type {
  AgentRunState, ConversationEvent, ConversationEventInput, ConversationRef,
  MemoryEvent, MemoryEventInput, MemoryNode,
} from '@owlmeans/agent-common'

/**
 * Storage, as this package needs it.
 *
 * These are PORTS, not resources. The package could have taken `Resource<T>` and let a consumer
 * register a backend under an alias — but a port names exactly what the plugin needs, which is a
 * far smaller surface than CRUD, and any backend can satisfy it: a resource, or a file on disk,
 * which is what the project-history equivalent is.
 *
 * Every port is optional to bind. A plugin whose port is missing degrades to a no-op rather than
 * throwing, exactly as `ExecutionService.checkpoint` does with no plugin registered: memory is an
 * enhancement, and an application that has not wired storage yet must still be able to run agents.
 */

export interface ConversationStore {
  /** The most recent `limit` events, NEWEST FIRST. */
  last: (ref: ConversationRef, limit: number) => Promise<ConversationEvent[]>
  /** Append one event, allocating its `seq`. */
  append: (event: ConversationEventInput) => Promise<ConversationEvent>
}

export interface MemoryGraphStore {
  /** Every node of a scope, without its content — names and links only. */
  index: (scope: string) => Promise<Array<Pick<MemoryNode, 'subsystem' | 'links' | 'updatedAt'>>>
  read: (scope: string, subsystem: string) => Promise<MemoryNode | null>
  write: (node: Omit<MemoryNode, 'id' | 'updatedAt'>) => Promise<MemoryNode>
}

export interface MemoryEventStore {
  /** The most recent `limit` events of a scope, NEWEST FIRST. */
  read: (scope: string, limit: number) => Promise<MemoryEvent[]>
  /** Append one event, allocating its `seq`, and prune the scope to `limit` if given. */
  append: (event: MemoryEventInput, limit?: number) => Promise<MemoryEvent>
}

export interface AgentRunStateStore {
  load: (runId: string) => Promise<AgentRunState | null>
  save: (state: AgentRunState) => Promise<void>
}
