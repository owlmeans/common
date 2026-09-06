import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { AIMessage, BaseMessage, HumanMessage } from '@langchain/core/messages'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { BasicConfig, BasicContext, InitializedService } from '@owlmeans/context'
import type { FlowModel, FlowProvider, ShallowFlow } from '@owlmeans/flow'
import type { Execution, LlmPlugin, ModelInputItem, PromptService } from '@owlmeans/llm'
import type { AgentRunStatus, ConversationEvent, ConversationRef } from '@owlmeans/agent-common'
import type { BaseCheckpointSaver } from '@langchain/langgraph'
import type { PipelineSpec, PipelineState } from '@owlmeans/agent-common'
import type { AgentTransport } from './runtime/transport.js'
import type { ConversationStore, PipelineRunStore } from './stores/types.js'
import type { PipelineModel, PipelineOptions } from './pipeline/types.js'

/** Tools an agent may call, keyed however the caller likes — resolution is by `tool.name`. */
export interface AgentToolSet { [key: string]: StructuredToolInterface }

/**
 * What the caller gets told about each model call.
 *
 * Shaped to match `spectate(spectator, callType)` from `@owlmeans/llm` exactly, so an application
 * that already has a spectator passes the curried function straight in.
 */
export interface AgentSpectateHook {
  (
    input: ModelInputItem[], message: AIMessage, action: string, retries: number, startedAt?: number,
  ): Promise<unknown>
}

export interface AgentOptions {
  /** The execution the run belongs to. Its `prompt` policy is the agent's persona. */
  exec: Execution
  /** Overrides the model resolved from the execution. */
  agentModel?: BaseChatModel
  tools: AgentToolSet
  /** Static volatile context. Lands in `PromptBlock.Context`, never in the cached prefix. */
  context?: string[]
  conversation?: ConversationRef
  /** LangGraph entrypoint name; shows up in traces. */
  entrypoint?: string
  spectate?: AgentSpectateHook
  prompts?: () => PromptService
  /**
   * Cheap model offered to prompt plugins for a single side call while the run's system
   * prompt is composed — normally `() => executions().utility(exec)`. Nothing resolves one
   * by default: the agent holds an execution, not the service that knows its policy.
   */
  utility?: () => BaseChatModel | undefined
  /** Provider plugin used for cache placement. Resolved from the model when omitted. */
  provider?: LlmPlugin
  maxTurns?: number
  /**
   * Errors that must escape `safeInvokeTool`'s containment instead of becoming a tool message.
   *
   * A tool may be a whole pipeline; when what stopped it is an exhausted budget or a refusal,
   * handing the model a readable error is an invitation to pick another tool and spend again.
   */
  fatal?: (e: unknown) => boolean
  /**
   * Whether `invoke()` finalizes the run itself.
   *
   * Leave it on for a caller whose work ends when the model stops talking. Turn it OFF when
   * something runs AFTER the agent that changes the outcome — a validation pass, a build — because
   * a compaction written before that step describes a state that did not survive it, and the
   * "what to do next" it produces is then advice about a world that no longer exists.
   */
  autoFinish?: boolean
  plugins?: AgentPlugin[]
}

export interface AgentInvokeArgs {
  /** LangChain `runName` for the model calls of this run. */
  action?: string
  /** Extra volatile context for this call only. */
  context?: string[]
}

export interface AgentRunOutcome {
  status: AgentRunStatus
  /** What happened after the loop — a fixer verdict, a build result. Reaches the compaction. */
  note?: string
  error?: Error
}

/** What a plugin sees. Deliberately carries no service: a model built standalone has none. */
export interface AgentRun {
  id: string
  conversation: ConversationRef
  exec: Execution
  flow: FlowModel
  /** The ask that opened the run. */
  prompt: string
  action: string
}

export interface AgentRunHandle {
  id: string
  conversation: ConversationRef
  /** Fires `onFinish` on every plugin. Idempotent — a second call is a no-op, never a second event. */
  finish: (outcome: AgentRunOutcome) => Promise<void>
}

export interface AgentResult {
  message: AIMessage
  /** The whole transcript of the run, the opening human message included. */
  messages: BaseMessage[]
  run: AgentRunHandle
}

/**
 * The package's own optional-capability seam.
 *
 * A plugin may contribute what an agent knows (`context`), what it can do (`tools`), watch it work
 * (`onTurn`), and act when it stops (`onFinish`). Everything memory- and summary-related in this
 * family is one of these; nothing in the loop itself knows those features exist.
 */
export interface AgentPlugin {
  alias: string
  /** Lower runs first. Defaults to 50. */
  order?: number
  context?: (run: AgentRun) => Promise<string[]>
  tools?: (run: AgentRun) => AgentToolSet
  onTurn?: (run: AgentRun, messages: readonly BaseMessage[]) => Promise<void>
  onFinish?: (run: AgentRun, result: AgentResult, outcome: AgentRunOutcome) => Promise<void>
  /**
   * Where pipeline runs of a given scope are recorded. The FIRST plugin that answers wins.
   *
   * A plugin rather than a service option because durability is an optional capability like every
   * other one here: an application that has not wired storage still runs pipelines, it just cannot
   * resume them.
   */
  runs?: (scope: string) => PipelineRunStore | undefined
  /** LangGraph's own persistence for a scope. Absent ⇒ the run replays from the row alone. */
  checkpointer?: (scope: string) => Promise<BaseCheckpointSaver | undefined>
}

export interface AgentModel {
  use: (plugin: AgentPlugin) => void
  invoke: (input: string | HumanMessage, args?: AgentInvokeArgs) => Promise<AgentResult>
  conversation: () => ConversationRef
}

export interface ConversationApi {
  last: (limit?: number) => Promise<ConversationEvent[]>
  append: (event: Omit<ConversationEvent, 'id' | 'seq' | 'createdAt'>) => Promise<ConversationEvent>
}

export interface AgentServiceOptions {
  /** Extra flows the provider should serve. The run lifecycle flow is always included. */
  flows?: ShallowFlow[]
  transport?: AgentTransport
  plugins?: AgentPlugin[]
  conversations?: ConversationStore
}

/** What a caller may leave to the service when it asks for a pipeline. */
export interface AgentPipelineOptions<S extends PipelineState, C>
  extends Omit<PipelineOptions<S, C>, 'runs' | 'checkpointer'> {
  /** The subject the runs belong to; the service resolves storage for it through its plugins. */
  scope: string
  runs?: PipelineRunStore
  checkpointer?: BaseCheckpointSaver
}

export interface AgentService extends InitializedService {
  /** Build an agent with the service's plugins already attached. */
  agent: (options: AgentOptions) => AgentModel
  /**
   * Build a pipeline with the service's storage already attached.
   *
   * The only difference from calling `makePipeline` directly: the run store and the checkpointer
   * are resolved from the registered plugins, so a consumer that has wired durability once gets it
   * everywhere without threading it through every call site.
   */
  pipeline: <S extends PipelineState, C>(
    spec: PipelineSpec, options: AgentPipelineOptions<S, C>
  ) => Promise<PipelineModel<S, C>>
  use: (plugin: AgentPlugin) => void
  plugins: () => AgentPlugin[]
  flow: FlowProvider
  transport: () => AgentTransport
  /** Conversation access for callers that want it outside a run. No store bound → empty results. */
  conversation: (ref: ConversationRef) => ConversationApi
}

export interface WithAgentsService {
  agents: () => AgentService
}

export type AgentContext<C extends BasicConfig = BasicConfig> = BasicContext<C> & WithAgentsService
