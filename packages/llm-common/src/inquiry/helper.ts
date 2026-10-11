import { DEFAULT_INQUIRY_ANSWER_CHARS, INQUIRY_STATE_TEXT_CHARS } from './consts.js'
import type { Inquiry, InquiryAnswer } from './types.js'
import type { InquiryHelper } from './helper/types.js'

export const createInquiryHelper = (): InquiryHelper => {
  const defaultAnswerFor = (inquiry: Inquiry): InquiryAnswer =>
    inquiry.default != null
      ? { inquiryId: inquiry.id, value: inquiry.default }
      : { inquiryId: inquiry.id, declined: true }

  const answeredWith = (answer: InquiryAnswer): string | null => {
    const value = Array.isArray(answer.value) ? answer.value[0] : answer.value
    if (value != null && value !== '') return value
    if (answer.text != null && answer.text !== '') return answer.text

    return null
  }

  const isDeclined = (answer: InquiryAnswer): boolean => answer.declined === true

  const capAnswer = (
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

  const stateAnswerOf = (answer: InquiryAnswer): InquiryAnswer =>
    answer.text != null && answer.text.length > INQUIRY_STATE_TEXT_CHARS
      ? { ...answer, text: answer.text.slice(0, INQUIRY_STATE_TEXT_CHARS), truncated: true }
      : answer

  const renderInquiry = (inquiry: Inquiry): string => {
    const options = inquiry.options != null && inquiry.options.length > 0
      ? ` (${inquiry.options.map(option => option.value).join(' | ')})`
      : ''

    return `[${inquiry.kind}] ${inquiry.question}${options}`.replace(/\s+/g, ' ').trim()
  }

  return { defaultAnswerFor, answeredWith, isDeclined, capAnswer, stateAnswerOf, renderInquiry }
}

export const inquiryHelper = createInquiryHelper()
