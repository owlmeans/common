import { type ModelTask, type ModelTaskResult, ConnectHarness, type InquiryAnswerPayload } from '@owlmeans/viable-common'

/**
 * Something that can answer a model task without a coding agent in front of it.
 *
 * Two consumers, and both are the reason it is an interface rather than a function on the session:
 * the end-to-end tests, which have to play the parent agent deterministically, and the CLI this
 * SDK exists to make possible, where the "parent agent" is the CLI's own model.
 */
export interface TaskDriver {
  answer: (task: ModelTask) => Promise<ModelTaskResult>
}

/** The minimum a chat model must offer to stand in for a parent agent. */
export interface DriverModel {
  invoke: (messages: Array<{ role: string, content: string }>) => Promise<string>
}

export interface LangchainLikeModel {
  invoke: (messages: unknown) => Promise<{ content: unknown }>
  bindTools?: (tools: unknown[], kwargs?: unknown) => LangchainLikeModel
}

export interface ModelDriverOptions {
  /** One model per tier. A tier with no model falls back to the first one given. */
  models: Partial<Record<string, LangchainLikeModel>>
}

export interface EnvelopeOptions {
  harness: ConnectHarness
  /** What the parent said it would run each tier on. Display only. */
  tiers?: Partial<Record<string, string>>
}

export interface ParsedTaskResult {
  result?: ModelTaskResult
  /** Present when the answer did not match what was asked. Quoted back to the parent verbatim. */
  problem?: string
}

export interface QuestionEnvelopeOptions {
  /** Which parent agent is reading this. Recorded rather than branched on — see below. */
  harness: ConnectHarness
}

export interface ParsedAnswer {
  answer?: InquiryAnswerPayload
  /** Present when what came back is not something this question can accept. Quoted back verbatim. */
  problem?: string
}
