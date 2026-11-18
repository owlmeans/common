import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { AIMessageChunk, MessageFieldWithRole } from '@langchain/core/messages'
import type { PromptFocus, SpectatorEntryLogged } from '@owlmeans/llm-common'
import type { LlmLoopCacheHints } from './plugins/types.js'
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

/** The answering turn of an `invoke`, before its result is unwrapped, coerced and checked. */
export interface StructuredTurn<T> {
  piece: AIMessageChunk | null
  result: T | null
  /** The request the turn sent. */
  msgs: MessageFieldWithRole[]
  placed: number
  startedAt: number
  entry?: SpectatorEntryLogged
}

/** A request prepared for one rung, in that rung's cache dialect. */
export interface PreparedRequest {
  msgs: MessageFieldWithRole[]
  /** Call options the dialect needs, spread into every stream call. */
  options: Record<string, unknown>
  /** Cache breakpoints placed. */
  placed: number
  /** The same request before any breakpoint was placed — what a tool round re-marks with `loopCache`. */
  plain: MessageFieldWithRole[]
  /** The composed opening, for `loopCache`: the system blocks, the project message, the lifetimes. */
  hints: LlmLoopCacheHints
  /** The composed policy caches the opening (`PromptPolicy.cacheSystem`). */
  cached: boolean
}
