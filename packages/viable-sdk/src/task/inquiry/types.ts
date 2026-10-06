import type { InquiryPayload } from '@owlmeans/viable-common'
import type { ParsedAnswer, QuestionEnvelopeOptions } from '../types.js'

/** One question handed to a parent agent, and the answer it sends back checked against it. */
export interface QuestionEnvelopeModel {
  readonly inquiry: InquiryPayload
  /**
   * What `next_question` hands the parent agent.
   *
   * Text, and in the same order a model task's envelope uses: how to handle it, what to call
   * afterwards, then the material — so a model that stops reading early has still read the
   * instruction. The question id appears at the top and in the follow-up call because it is the only
   * thing that routes an answer back.
   *
   * The one thing this envelope says that the task envelope inverts: **do not isolate it**. A model
   * task is handed to a clean subagent precisely so no context leaks into it; a question is handed to
   * a PERSON, and a subagent has none. So there is no harness-specific isolation wording here at
   * all — the harness is carried only because the caller has it and a future difference would belong
   * beside the rest.
   *
   * The declined line is present on every question, whatever its kind. A parent whose user is not
   * available has to have a way to say so: without one it either waits out a 45-minute timeout or
   * invents an answer, and the second is worse.
   */
  renderQuestionEnvelope: (opts: QuestionEnvelopeOptions) => string
  /**
   * Check what the parent sent against the question that asked for it, before the platform sees it.
   *
   * The same rule the model-task parser follows, for the same reason: a refusal caught here is a
   * sentence the parent can act on immediately, with the person still in front of it, while one the
   * platform catches costs a round trip on a question a human already answered. So a mismatch comes
   * back as a `problem` rather than a throw, and every problem names what WOULD be accepted.
   *
   * `declined` short-circuits everything. It is a real answer — somebody saw the question and chose
   * not to decide — and reading anything else beside it would let a parent both decline and answer.
   */
  parseAnswer: (raw: Record<string, unknown>) => ParsedAnswer
}
