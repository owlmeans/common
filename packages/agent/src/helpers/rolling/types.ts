import type { LlmModel } from '@owlmeans/llm'

export interface RollingSummaryInput {
  /** Omit to skip the model and take the deterministic path. */
  model?: LlmModel
  /** The prose account so far. Empty on the first fold. */
  previous: string
  /** What just happened, as one line. */
  event: string
  /** Anything the fold may use but that need not survive into the summary. */
  details?: string
  /** Hard ceiling on the returned prose, in characters. */
  maxChars: number
  /** LangChain `runName`. Give it a value the application filters out of its user-facing stream. */
  action?: string
}
