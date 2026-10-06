import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { ModelConfig } from '../../types.js'
import type { LlmPlugin } from '../../plugins/types.js'

/** One model of a role's escalation chain, with the config and plugin it is called through. */
export interface Rung {
  index: number
  model: BaseChatModel
  config: Partial<ModelConfig>
  plugin: LlmPlugin | undefined
}

/** The rung one attempt runs on, and how far into that rung it is. */
export interface RungPosition {
  rung: Rung
  rungAttempt: number
}

/** A role's escalation chain: the primary and every fallback hung off it. */
export interface RungUtils {
  /**
   * The primary and every fallback the service hung off it, in escalation order. Read once from
   * the ORIGINAL instances: a refined model does not keep its metadata.
   */
  rungsOf: (model: BaseChatModel) => Rung[]
  /** The rung attempt N runs on, and how far into that rung it is. The last rung never ends. */
  rungAt: (rungs: Rung[], attempt: number) => RungPosition
}
