import type { ConnectWaitReason } from '../consts.js'
import type { InquiryAnswerPayload, InquiryPayload } from '../ops/types.js'

export interface ConnectPipelineParams {
  id: string
  runId: string
}

export interface ConnectPipelineResumeBody {
  from?: string
  force?: boolean
  /**
   * Answers to the questions a parked run is waiting on, keyed by inquiry id.
   *
   * A run stops at `Waiting` because a step asked something; resuming it without what it asked for
   * makes it ask again. The runner MERGES these into whatever the run already carries rather than
   * replacing them, so a resume that answers one of two outstanding questions keeps the other.
   */
  answers?: Record<string, InquiryAnswerPayload>
}

/** The persistent state of one pipeline run, read by a connector without platform internals. */
export interface ConnectPipelineState {
  runId: string
  pipeline: string
  version: number
  status: string
  step?: string
  completed: string[]
  pending: string[]
  warnings: string[]
  failedAt?: string
  error?: string
  note?: string
  waitingFor?: ConnectWaitReason
  pendingInquiry?: InquiryPayload
  attempts: number
  startedAt: string
  heartbeatAt: string
  updatedAt: string
}
