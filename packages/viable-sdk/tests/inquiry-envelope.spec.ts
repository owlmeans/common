import { describe, expect, test } from 'bun:test'
import {
  ConnectHarness, ConnectInquiryKind, CONNECT_INQUIRY_MAX_TEXT
} from '@owlmeans/viable-common'
import type { InquiryPayload } from '@owlmeans/viable-common'

import { CONFIRM_NO, CONFIRM_YES, parseAnswer, renderQuestionEnvelope } from '../src/task/inquiry.js'

const inquiry = (patch: Partial<InquiryPayload> = {}): InquiryPayload => ({
  id: 'q1',
  projectId: 'p1',
  kind: ConnectInquiryKind.Choice,
  question: 'Is this one product or two?',
  options: [
    { value: 'one', label: 'One product', description: 'A single application' },
    { value: 'two', label: 'Two products' },
  ],
  expiresAt: '2026-01-01T00:00:00.000Z',
  ...patch,
})

const render = (payload: InquiryPayload): string =>
  renderQuestionEnvelope(payload, { harness: ConnectHarness.ClaudeCode })

/**
 * What a parent agent is handed when the platform needs a person, and what its answer is checked
 * against before the platform ever sees it.
 *
 * Two things here are the whole reason this file exists. The ORDER — a model reading a tool result
 * acts on what it read first, so the instruction has to precede the material. And the refusal
 * matrix, because every problem `parseAnswer` returns is a sentence the parent can act on with the
 * person still in front of it, while a malformed answer that reaches the platform costs a round
 * trip on a question a human has already answered.
 */
describe('viable-sdk — the question envelope', () => {
  test('the instruction comes before the material', () => {
    const text = render(inquiry())

    expect(text.indexOf('HOW TO ANSWER THIS')).toBeLessThan(text.indexOf('--- THE QUESTION ---'))
    expect(text.indexOf('WHAT TO SEND BACK')).toBeLessThan(text.indexOf('--- THE QUESTION ---'))
    // The id routes the answer back, so it opens the envelope and closes it.
    expect(text.startsWith('=== VIABLE QUESTION q1 ===')).toBe(true)
    expect(text.endsWith('=== END QUESTION q1 ===')).toBe(true)
  })

  test('it tells the parent NOT to answer it, and says nothing about subagents', () => {
    // The inversion of the model-task envelope: a task is isolated so no context leaks into it, a
    // question is carried to a person, and a subagent has no person in it.
    const text = render(inquiry())

    expect(text).toContain('do not answer it yourself')
    expect(text).toContain('Put this question to the person you are working for')
    for (const word of ['subagent', 'viable-worker', 'CLEAN', 'isolated', 'reasoning effort']) {
      expect(text).not.toContain(word)
    }
  })

  test('the declined line is always there', () => {
    // A parent whose user is not available must have a way to say so: without one it waits out a
    // 45-minute timeout, or invents an answer.
    for (const kind of Object.values(ConnectInquiryKind)) {
      expect(render(inquiry({ kind }))).toContain('"declined": true')
    }
  })

  test('options carry their descriptions, and the default line appears only with a default', () => {
    const text = render(inquiry())

    expect(text).toContain('one — One product')
    expect(text).toContain('A single application')
    expect(text).not.toContain('IF NOBODY ANSWERS')

    const defaulted = render(inquiry({ default: 'one' }))
    expect(defaulted).toContain('IF NOBODY ANSWERS')
    expect(defaulted).toContain('The platform will assume: one')

    expect(render(inquiry({ default: ['one', 'two'], multiple: true })))
      .toContain('The platform will assume: one, two')
  })

  test('a confirm prints the two values it is answered with', () => {
    // A confirm carries no options, so "one of the values below" pointed at nothing: the parent
    // had to already know the two words, and a question a person answered came back as a value the
    // asker had never heard of.
    const text = render(inquiry({ kind: ConnectInquiryKind.Confirm, options: undefined }))

    expect(text).toContain(`"answer": "${CONFIRM_YES}"`)
    expect(text).toContain(`"answer": "${CONFIRM_NO}"`)
    expect(text).not.toContain('one of the values below')

    // And what it prints is what the parser takes back — in whatever case the parent sends it.
    for (const said of [CONFIRM_YES, CONFIRM_YES.toUpperCase(), ' Yes ']) {
      expect(parseAnswer(inquiry({ kind: ConnectInquiryKind.Confirm, options: undefined }), { answer: said }).answer?.value)
        .toBe(CONFIRM_YES)
    }
    for (const said of [CONFIRM_NO, CONFIRM_NO.toUpperCase(), ' No ']) {
      expect(parseAnswer(inquiry({ kind: ConnectInquiryKind.Confirm, options: undefined }), { answer: said }).answer?.value)
        .toBe(CONFIRM_NO)
    }
  })

  test('a text question leads with the field it is actually answered in', () => {
    // It has no values below either, and the one line a model reads first has to be a call it can
    // make.
    const text = render(inquiry({ kind: ConnectInquiryKind.Text, options: undefined }))

    expect(text).not.toContain('one of the values below')
    expect(text).toContain('"text": "<what they said>"')
  })

  test('a choice that arrived with no choices is read as a text question, both ways', () => {
    // The shape reaches here: `options` is optional on the wire and only the free-flight `ask_user`
    // tool enforces the 2..max rule. It printed `"answer": "<one of the values below>"` above no
    // OPTIONS section at all — a call naming values the envelope never listed — and the parser
    // then took ANY string as a chosen value the asker can match against nothing.
    for (const options of [[], undefined]) {
      const empty = inquiry({ kind: ConnectInquiryKind.Choice, options })
      const text = render(empty)

      expect(text).not.toContain('one of the values below')
      expect(text).not.toContain('--- OPTIONS ---')
      expect(text).toContain('"text": "<what they said>"')

      // What it prints is what comes back; a value is refused by naming the field that works.
      expect(parseAnswer(empty, { text: 'they want both' }).answer)
        .toEqual({ inquiryId: 'q1', text: 'they want both' })

      const { answer, problem } = parseAnswer(empty, { answer: 'three' })
      expect(answer).toBeUndefined()
      expect(problem).toContain('offers no choices')
      expect(problem).not.toContain('choices ()')
    }
  })

  test('the several-answers and own-words lines appear only where the question allows them', () => {
    const plain = render(inquiry())
    expect(plain).not.toContain('(several)')
    expect(plain).not.toContain('(their own words)')

    expect(render(inquiry({ multiple: true }))).toContain('(several)')
    expect(render(inquiry({ allowText: true }))).toContain('(their own words)')
    expect(render(inquiry({ kind: ConnectInquiryKind.Text }))).toContain('(their own words)')

    // Neither belongs to a confirm: it takes one of two words and nothing else.
    const confirm = render(inquiry({
      kind: ConnectInquiryKind.Confirm, options: undefined, multiple: true, allowText: true,
    }))
    expect(confirm).not.toContain('(several)')
    expect(confirm).not.toContain('(their own words)')
  })
})

describe('viable-sdk — reading what the parent sent back', () => {
  test('declined short-circuits everything else', () => {
    const { answer, problem } = parseAnswer(inquiry(), { declined: true, answer: 'one' })

    expect(problem).toBeUndefined()
    expect(answer).toEqual({ inquiryId: 'q1', declined: true })
  })

  test('an empty answer says what would be accepted', () => {
    const { problem } = parseAnswer(inquiry(), {})

    expect(problem).toBe('Send an answer, a text, or declined: true.')
  })

  test('a confirm takes the words a model actually sends', () => {
    const confirm = inquiry({ kind: ConnectInquiryKind.Confirm, options: undefined })
    for (const said of ['yes', 'YES', 'y', 'true', true]) {
      expect(parseAnswer(confirm, { answer: said }).answer?.value).toBe(CONFIRM_YES)
    }
    for (const said of ['no', 'N', 'false', false]) {
      expect(parseAnswer(confirm, { answer: said }).answer?.value).toBe(CONFIRM_NO)
    }

    const { problem } = parseAnswer(confirm, { answer: 'maybe' })
    expect(problem).toContain(CONFIRM_YES)
    expect(problem).toContain(CONFIRM_NO)
  })

  test('a choice must be one of the choices, and the refusal lists them', () => {
    const { answer } = parseAnswer(inquiry(), { answer: 'one' })
    expect(answer).toEqual({ inquiryId: 'q1', value: 'one' })

    const { problem } = parseAnswer(inquiry(), { answer: 'three' })
    expect(problem).toBe('"three" is not one of the choices (one, two).')
  })

  test('several answers need a question that asked for several', () => {
    expect(parseAnswer(inquiry(), { answer: ['one', 'two'] }).problem)
      .toBe('This question takes ONE answer (one, two).')

    const { answer } = parseAnswer(inquiry({ multiple: true }), { answer: ['one', 'two'] })
    expect(answer?.value).toEqual(['one', 'two'])
  })

  test('text alone answers a choice only where the question allows it', () => {
    // Accepting it elsewhere silently loses the decision: the asker matches a value against its
    // own options and finds nothing.
    const refused = parseAnswer(inquiry(), { text: 'neither, really' })
    expect(refused.answer).toBeUndefined()
    expect(refused.problem).toContain('one, two')

    const accepted = parseAnswer(inquiry({ allowText: true }), { text: 'neither, really' })
    expect(accepted.answer).toEqual({ inquiryId: 'q1', text: 'neither, really' })
  })

  test('a text question takes text, or a string sent as the answer', () => {
    const text = inquiry({ kind: ConnectInquiryKind.Text, options: undefined })

    expect(parseAnswer(text, { text: '  a reporting tool  ' }).answer)
      .toEqual({ inquiryId: 'q1', text: 'a reporting tool' })
    expect(parseAnswer(text, { answer: 'a reporting tool' }).answer)
      .toEqual({ inquiryId: 'q1', text: 'a reporting tool' })
  })

  test('the ONE ceiling refuses rather than truncating', () => {
    // Cutting it here would hand the asker most of a decision and say nothing, while the person
    // who gave it is still in front of the parent.
    const text = inquiry({ kind: ConnectInquiryKind.Text, options: undefined })
    const long = 'x'.repeat(CONNECT_INQUIRY_MAX_TEXT + 1)

    const { answer, problem } = parseAnswer(text, { text: long })
    expect(answer).toBeUndefined()
    expect(problem).toContain(String(CONNECT_INQUIRY_MAX_TEXT))

    expect(parseAnswer(text, { text: 'x'.repeat(CONNECT_INQUIRY_MAX_TEXT) }).problem).toBeUndefined()
  })

  test('the ceiling covers the words sent BESIDE a chosen value', () => {
    // The rider on a choice is the one path a length the wire schema refuses could otherwise
    // take: accepted here, it is sent on the operation and refused by `InquiryAnswerSchema` —
    // exactly the round trip on an already-answered question that this refusal exists to avoid.
    const { answer, problem } = parseAnswer(
      inquiry({ allowText: true }),
      { answer: 'one', text: 'x'.repeat(CONNECT_INQUIRY_MAX_TEXT + 1) }
    )

    expect(answer).toBeUndefined()
    expect(problem).toContain(String(CONNECT_INQUIRY_MAX_TEXT))
  })
})
