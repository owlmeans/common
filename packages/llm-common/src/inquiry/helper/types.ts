import type { Inquiry, InquiryAnswer } from '../types.js'

/**
 * Pure helpers over an inquiry and its answer — no IO, no state, no clock.
 *
 * They are here rather than in the runtime because every layer needs the same reading of an
 * answer: the execution service, the pipeline runner, the `ask_user` tool, the connector and the
 * screen that finally shows it. A second reading of "was this answered" is a second contract.
 */
export interface InquiryHelper {
  /**
   * What to assume when nobody answers: the question's own default, or a decline.
   *
   * A decline is an ANSWER — the run carries on and records what it assumed — which is why this
   * never throws and never returns null.
   */
  defaultAnswerFor: (inquiry: Inquiry) => InquiryAnswer
  /**
   * The one thing an answer says, as a string — the first chosen value, else the free text, else
   * `null` when it says nothing at all (a decline, or an empty answer).
   */
  answeredWith: (answer: InquiryAnswer) => string | null
  /** Nobody could decide. Distinct from an empty answer — see {@link InquiryHelper.answeredWith}. */
  isDeclined: (answer: InquiryAnswer) => boolean
  /**
   * Cut an answer's free TEXT to the ceiling and SAY SO.
   *
   * Only the prose is cut. A `value` IS the decision — for a choice it has to equal one of the
   * question's own option values — so slicing one does not degrade an answer, it silently replaces
   * it with an identifier nobody offered and nothing matches, which `answeredWith` then hands on as
   * what the person chose. An over-long value is a defect upstream rather than a long answer (the
   * connector's schema refuses one outright instead of shortening it), so it travels on whole and is
   * REPORTED through `truncated` — the flag every consumer already reads as "this is not exactly
   * what the person gave".
   */
  capAnswer: (answer: InquiryAnswer, max?: number) => InquiryAnswer
  /**
   * The copy of an answer a resumable pipeline STATE keeps: the decision whole, the prose cut to
   * {@link INQUIRY_STATE_TEXT_CHARS}.
   *
   * The full answer goes back to whoever asked; only this reduced one is persisted, so a run that
   * asks several questions still holds a state made of keys rather than of paragraphs.
   */
  stateAnswerOf: (answer: InquiryAnswer) => InquiryAnswer
  /** One-line label of a question — for a note, a trace line or a run row. */
  renderInquiry: (inquiry: Inquiry) => string
}
