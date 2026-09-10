import { describe, expect, test } from 'bun:test'
import {
  answeredWith, capAnswer, CONFIRM_NO, CONFIRM_YES, defaultAnswerFor, DEFAULT_INQUIRY_ANSWER_CHARS,
  INQUIRY_STATE_TEXT_CHARS, InquiryKind, isDeclined, renderInquiry, stateAnswerOf,
} from '../src/index.js'
import type { Inquiry, InquiryAnswer } from '../src/index.js'

/**
 * The pure half of the inquiry primitive. Every layer that carries an answer — the execution
 * service, the pipeline runner, the `ask_user` tool, the connector — reads it through exactly
 * these functions, so a second reading of "was this answered" is what these specs exist to stop.
 */

const inquiry = (patch: Partial<Inquiry> = {}): Inquiry => ({
  id: 'q1',
  kind: InquiryKind.Choice,
  question: 'Which database does the origin use?',
  options: [
    { value: 'postgres', label: 'PostgreSQL' },
    { value: 'mongo', label: 'MongoDB' },
  ],
  ...patch,
})

describe('@owlmeans/llm-common — what an unanswered question assumes', () => {
  test('a question with a default answers itself with it', () => {
    expect(defaultAnswerFor(inquiry({ default: 'postgres' })))
      .toEqual({ inquiryId: 'q1', value: 'postgres' })
  })

  test('a question without one declines — a decision, never a failure', () => {
    const answer = defaultAnswerFor(inquiry())
    expect(isDeclined(answer)).toBe(true)
    expect(answeredWith(answer)).toBeNull()
  })

  test('a multiple-choice default travels whole', () => {
    expect(defaultAnswerFor(inquiry({ multiple: true, default: ['postgres', 'mongo'] })).value)
      .toEqual(['postgres', 'mongo'])
  })
})

describe('@owlmeans/llm-common — reading one answer', () => {
  test('the chosen value wins over free text, and the first of a list is the answer', () => {
    expect(answeredWith({ inquiryId: 'q1', value: 'mongo', text: 'or postgres' })).toBe('mongo')
    expect(answeredWith({ inquiryId: 'q1', value: ['mongo', 'redis'] })).toBe('mongo')
  })

  test('free text answers a question that offered no options', () => {
    expect(answeredWith({ inquiryId: 'q1', text: 'the vendor one' })).toBe('the vendor one')
  })

  test('an answer that says nothing reads as nothing, declined or not', () => {
    expect(answeredWith({ inquiryId: 'q1' })).toBeNull()
    expect(answeredWith({ inquiryId: 'q1', value: '', text: '' })).toBeNull()
    expect(isDeclined({ inquiryId: 'q1' })).toBe(false)
    expect(isDeclined({ inquiryId: 'q1', declined: true })).toBe(true)
  })

  test('a confirmation is just its two values', () => {
    expect(answeredWith({ inquiryId: 'q1', value: CONFIRM_YES })).toBe(CONFIRM_YES)
    expect(answeredWith({ inquiryId: 'q1', value: CONFIRM_NO })).toBe(CONFIRM_NO)
  })
})

describe('@owlmeans/llm-common — the one ceiling', () => {
  test('an answer inside the ceiling is left exactly as it came', () => {
    const answer: InquiryAnswer = { inquiryId: 'q1', value: 'mongo', text: 'because of the driver' }
    expect(capAnswer(answer)).toEqual(answer)
    expect(capAnswer(answer).truncated).toBeUndefined()
  })

  test('a cut is never silent', () => {
    const capped = capAnswer({ inquiryId: 'q1', text: 'x'.repeat(DEFAULT_INQUIRY_ANSWER_CHARS + 5) })
    expect(capped.text).toHaveLength(DEFAULT_INQUIRY_ANSWER_CHARS)
    expect(capped.truncated).toBe(true)
  })

  test('an over-long value is reported, never shortened into an option nobody offered', () => {
    const value = ['ok', 'y'.repeat(40)]
    const capped = capAnswer({ inquiryId: 'q1', value }, 10)
    // Cutting prose degrades an answer; cutting an identifier CHANGES it — `answeredWith` would
    // then hand the caller a choice the question never carried.
    expect(capped.value).toEqual(value)
    expect(capped.truncated).toBe(true)
  })

  test('the state copy keeps the decision whole and cuts only the prose', () => {
    const answer: InquiryAnswer = {
      inquiryId: 'q1', value: 'postgres', text: 'z'.repeat(INQUIRY_STATE_TEXT_CHARS + 100),
    }
    const stored = stateAnswerOf(answer)
    expect(stored.value).toBe('postgres')
    expect(stored.text).toHaveLength(INQUIRY_STATE_TEXT_CHARS)
    expect(stored.truncated).toBe(true)
    // The answer handed back to whoever asked is untouched — only the persisted copy is reduced.
    expect(answer.text).toHaveLength(INQUIRY_STATE_TEXT_CHARS + 100)
    expect(stateAnswerOf({ inquiryId: 'q1', value: 'postgres' }).truncated).toBeUndefined()
  })
})

describe('@owlmeans/llm-common — one line for a trace', () => {
  test('the label names the kind, the question and the choices, on one line', () => {
    expect(renderInquiry(inquiry({ question: 'Which\n  database?' })))
      .toBe('[choice] Which database? (postgres | mongo)')
  })

  test('a question with no options renders without an empty bracket', () => {
    expect(renderInquiry({ id: 'q2', kind: InquiryKind.Confirm, question: 'Relocate the origin?' }))
      .toBe('[confirm] Relocate the origin?')
  })
})
