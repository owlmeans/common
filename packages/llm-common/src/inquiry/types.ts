import type { InquiryKind, InquiryPolicy } from './consts.js'

/**
 * One question put to a person while a run is in flight, and the answer that comes back.
 *
 * Everything here is serializable for the same reason a delegated task is: whoever answers is
 * outside this process — a browser dialog, a coding agent driving the application through a
 * connector, a test double — and the question may outlive the process that asked it, parked on a
 * pipeline run row until somebody comes back to it.
 */

export interface InquiryOption {
  value: string
  label: string
  description?: string
}

export interface Inquiry {
  /** Stable id, chosen by whoever asks. The ONLY thing that routes an answer back. */
  id: string
  kind: InquiryKind
  /** One question, in plain words. */
  question: string
  /** One or two sentences of background. Never the whole task. */
  context?: string
  /** Required for {@link InquiryKind.Choice}; ignored otherwise. */
  options?: InquiryOption[]
  multiple?: boolean
  /** A `Choice` the answerer may answer in their own words instead. */
  allowText?: boolean
  /** What to assume when nobody answers. {@link InquiryPolicy.Default} returns exactly this. */
  default?: string | string[]
  expiresAt?: string
}

export interface InquiryAnswer {
  inquiryId: string
  value?: string | string[]
  text?: string
  /** Nobody could decide. A legitimate ANSWER, never a failure. */
  declined?: boolean
  /**
   * This answer is not exactly the one that was given. Never an answerer's own flag.
   *
   * Two writers, two ceilings: `capAnswer` cuts the text to `DEFAULT_INQUIRY_ANSWER_CHARS` (and
   * raises this WITHOUT cutting when a `value` arrived over that ceiling, since a shortened
   * identifier matches no option), while `stateAnswerOf` cuts the text again to the much smaller
   * `INQUIRY_STATE_TEXT_CHARS` a pipeline state may hold. So a flag read back off a resumed run
   * says the state's copy is short — not that the person hit the answer ceiling.
   *
   * It exists so no cut is silent: whoever records the answer can say that the rest of it was
   * dropped, instead of the answerer discovering it in the work that followed.
   */
  truncated?: boolean
}

/**
 * How a question reaches a person.
 *
 * One method, like `DelegateTransport` beside it, and for the same reason: routing, waiting,
 * redelivery and giving up all belong to whoever implements it. A transport that cannot serve the
 * question must THROW rather than answer — a declined answer is a decision, while a channel that
 * is not there is terminal, and the two must never look alike.
 */
export interface InquiryTransport {
  ask: (inquiry: Inquiry, signal?: AbortSignal) => Promise<InquiryAnswer>
}

/**
 * How one run may put a question to a person. Carried on an execution's serializable state, so a
 * resumed run keeps the channel and the policy it was started with.
 */
export interface InquiryConfig {
  /** The key the application seated an {@link InquiryTransport} under. */
  transport?: string
  policy: InquiryPolicy
}
