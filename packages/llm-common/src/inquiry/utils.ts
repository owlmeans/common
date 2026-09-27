import { DEFAULT_INQUIRY_ANSWER_CHARS, INQUIRY_STATE_TEXT_CHARS } from './consts.js'
import type { Inquiry, InquiryAnswer } from './types.js'

/**
 * Pure helpers over an inquiry and its answer — no IO, no state, no clock.
 *
 * They are here rather than in the runtime because every layer needs the same reading of an
 * answer: the execution service, the pipeline runner, the `ask_user` tool, the connector and the
 * screen that finally shows it. A second reading of "was this answered" is a second contract.
 */

/**
 * What to assume when nobody answers: the question's own default, or a decline.
 *
 * A decline is an ANSWER — the run carries on and records what it assumed — which is why this
 * never throws and never returns null.
 */
export const defaultAnswerFor = (inquiry: Inquiry): InquiryAnswer =>
  inquiry.default != null
    ? { inquiryId: inquiry.id, value: inquiry.default }
    : { inquiryId: inquiry.id, declined: true }

/**
 * The one thing an answer says, as a string — the first chosen value, else the free text, else
 * `null` when it says nothing at all (a decline, or an empty answer).
 */
export const answeredWith = (answer: InquiryAnswer): string | null => {
  const value = Array.isArray(answer.value) ? answer.value[0] : answer.value
  if (value != null && value !== '') return value
  if (answer.text != null && answer.text !== '') return answer.text

  return null
}

/** Nobody could decide. Distinct from an empty answer — see {@link answeredWith}. */
export const isDeclined = (answer: InquiryAnswer): boolean => answer.declined === true

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
export const capAnswer = (
  answer: InquiryAnswer, max: number = DEFAULT_INQUIRY_ANSWER_CHARS
): InquiryAnswer => {
  const text = answer.text != null && answer.text.length > max
    ? answer.text.slice(0, max)
    : undefined
  const values = Array.isArray(answer.value)
    ? answer.value
    : answer.value != null ? [answer.value] : []
  const oversized = values.some(value => value.length > max)

  if (text == null && !oversized) return answer

  return { ...answer, ...(text != null ? { text } : {}), truncated: true }
}

/**
 * The copy of an answer a resumable pipeline STATE keeps: the decision whole, the prose cut to
 * {@link INQUIRY_STATE_TEXT_CHARS}.
 *
 * The full answer goes back to whoever asked; only this reduced one is persisted, so a run that
 * asks several questions still holds a state made of keys rather than of paragraphs.
 */
export const stateAnswerOf = (answer: InquiryAnswer): InquiryAnswer =>
  answer.text != null && answer.text.length > INQUIRY_STATE_TEXT_CHARS
    ? { ...answer, text: answer.text.slice(0, INQUIRY_STATE_TEXT_CHARS), truncated: true }
    : answer

/** One-line label of a question — for a note, a trace line or a run row. */
export const renderInquiry = (inquiry: Inquiry): string => {
  const options = inquiry.options != null && inquiry.options.length > 0
    ? ` (${inquiry.options.map(option => option.value).join(' | ')})`
    : ''

  return `[${inquiry.kind}] ${inquiry.question}${options}`.replace(/\s+/g, ' ').trim()
}
