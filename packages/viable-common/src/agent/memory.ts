/**
 * The agent-memory contracts, re-exported under viable's own name.
 *
 * The platform reaches `@owlmeans/agent-common` through here rather than importing it directly,
 * for the same reason it reaches the LLM contracts through this package: the platform pins one
 * version of the agent library, and a direct import would bind it to a second copy of the same
 * types. Serializable contracts only — the runtime is `@owlmeans/agent`, re-exported by
 * `@owlmeans/viable`.
 */

export { AgentRunStatus, conversationFor, truncateAt } from '@owlmeans/agent-common'

export type {
  ConversationRef, ConversationEvent, ConversationEventInput,
  MemoryNode, MemoryEvent, MemoryEventInput,
} from '@owlmeans/agent-common'
