import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { MessageFieldWithRole } from '@langchain/core/messages'
import type { PromptFocus } from '@owlmeans/llm-common'
import type { ModelInput } from './types.js'
import type { Rung } from './utils/rungs/types.js'

export type StreamOptions = Parameters<BaseChatModel['stream']>[1]

/** The rung an attempt runs on, and the instance refined for that attempt. */
export interface ActiveRung extends Rung {
  refined: BaseChatModel
}

/** Everything one call hands to `prepare` — the same for every rung it may run on. */
export interface PrepareRequest {
  input: ModelInput
  action: string
  /** `invoke`/`request`: the prompt must mention JSON. */
  json: boolean
  /** The structured-output tool, for a rung that has to be asked for it in words. */
  toolName?: string
  /** `schemaPlacement: 'tail'`: the schema instruction, appended after the composed Tail. */
  schemaText?: string
  /** Per-call skills (`LlmCallOptions.skills`). */
  skills?: string[]
  stable?: number
  focus?: PromptFocus
  cacheMax?: number
}

/** A request prepared for one rung, in that rung's cache dialect. */
export interface PreparedRequest {
  msgs: MessageFieldWithRole[]
  /** Call options the dialect needs, spread into every stream call. */
  options: Record<string, unknown>
  /** Cache breakpoints placed. */
  placed: number
}
