import { inquiryHelper } from './helper.js'
import type { Inquiry, InquiryAnswer } from './types.js'

/** @deprecated compat:factory-refactor — use `inquiryHelper.defaultAnswerFor(…)` */
export const defaultAnswerFor = (inquiry: Inquiry): InquiryAnswer => inquiryHelper.defaultAnswerFor(inquiry)

/** @deprecated compat:factory-refactor — use `inquiryHelper.answeredWith(…)` */
export const answeredWith = (answer: InquiryAnswer): string | null => inquiryHelper.answeredWith(answer)

/** @deprecated compat:factory-refactor — use `inquiryHelper.isDeclined(…)` */
export const isDeclined = (answer: InquiryAnswer): boolean => inquiryHelper.isDeclined(answer)

/** @deprecated compat:factory-refactor — use `inquiryHelper.capAnswer(…)` */
export const capAnswer = (answer: InquiryAnswer, max?: number): InquiryAnswer => inquiryHelper.capAnswer(answer, max)

/** @deprecated compat:factory-refactor — use `inquiryHelper.stateAnswerOf(…)` */
export const stateAnswerOf = (answer: InquiryAnswer): InquiryAnswer => inquiryHelper.stateAnswerOf(answer)

/** @deprecated compat:factory-refactor — use `inquiryHelper.renderInquiry(…)` */
export const renderInquiry = (inquiry: Inquiry): string => inquiryHelper.renderInquiry(inquiry)
