import type { BaseChatModel } from '@langchain/core/language_models/chat_models'
import type { Rung } from './utils/rungs/types.js'

export type StreamOptions = Parameters<BaseChatModel['stream']>[1]

/** The rung an attempt runs on, and the instance refined for that attempt. */
export interface ActiveRung extends Rung {
  refined: BaseChatModel
}
