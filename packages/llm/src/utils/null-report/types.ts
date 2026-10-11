import type { LlmPurpose, NullKind } from '@owlmeans/llm-common'
import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { AIMessageChunk, MessageFieldWithRole } from '@langchain/core/messages'
import type { ModelConfig } from '../../types.js'

export interface NullReportParams {
  kind: NullKind
  action: string
  purpose?: LlmPurpose
  attempt: number
  startedAt: number
  /** The instance that actually ran — its `lc_kwargs` carry the effective request shape. */
  refined: BaseChatModel
  /** The ORIGINAL model config (refined instances do not reliably keep metadata). */
  config: Partial<ModelConfig>
  msgs: MessageFieldWithRole[]
  raw: AIMessageChunk | null
  schema?: { toolName: string; innerSchema: unknown }
  useCache: boolean
}

/** The request shape read back off a refined instance's `lc_kwargs`. */
export interface RefinedKwargs {
  model?: string
  configuration?: { baseURL?: string }
  modelKwargs?: { reasoning?: unknown }
  topP?: number
}
