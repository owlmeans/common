import type { LlmModel } from '@owlmeans/llm'
import type { BaseMessage } from '@langchain/core/messages'
import { AgentRunStatus } from '@owlmeans/agent-common'

export interface Compaction {
  summary: string
  advice?: string
}

export interface CompactionInput {
  /** Omit to skip the model entirely and take the deterministic path. */
  model?: LlmModel
  /** The ask that opened the run. */
  prompt: string
  messages: readonly BaseMessage[]
  status: AgentRunStatus
  /** What happened after the loop — a validation verdict, a build result. */
  note?: string
  maxSummaryChars?: number
  maxAdviceChars?: number
  /** LangChain `runName`. Give it a value the application filters, or the summary of a run streams into the user's view of that run. */
  action?: string
  /** How much of the transcript to show the model. */
  maxTranscriptChars?: number
}

/** The handover between two runs on one subject: a summary and the advice that carries intent. */
export interface CompactionHelper {
  /** The text of a message, whatever content shape it arrived in. */
  messageText: (message: BaseMessage) => string
  /**
   * A transcript the model can read, newest-biased.
   *
   * The tail is what matters to a compaction — how the run ENDED decides what to do next — so when
   * the budget binds it is the head that goes.
   */
  renderTranscript: (messages: readonly BaseMessage[], maxChars?: number) => string
  /**
   * Compact a finished run into what the next one needs.
   *
   * Two parts, deliberately. A summary alone leaves the next run to re-derive the plan from the
   * outcome, which is where it invents a different one; the advice is the half that carries intent
   * across the gap.
   *
   * **Never throws, and never trusts the model's arithmetic.** The character caps are applied after
   * the answer comes back, because a cap in a prompt is a request. When the model is absent or fails
   * — an exhausted budget is the common case, and asking again would fail the same way — the
   * deterministic fallback still produces a usable event: what was asked, and how it ended.
   */
  composeCompaction: (input: CompactionInput) => Promise<Compaction>
}
