import { ConnectInquiryKind, CONNECT_INQUIRY_MAX_TEXT, type InquiryAnswerPayload, type InquiryPayload } from '@owlmeans/viable-common'
import { CONFIRM_WORDS } from './consts.local.js'
import { CONFIRM_NO, CONFIRM_YES } from './consts.js'
import type { ParsedAnswer, QuestionEnvelopeOptions } from './types.js'
import type { QuestionEnvelopeModel } from './inquiry/types.js'


/** Whether this question actually carries values a parent can pick from. */
const hasOptions = (inquiry: InquiryPayload): boolean =>
  inquiry.options != null && inquiry.options.length > 0

/**
 * The call lines a question of THIS kind is answered with.
 *
 * Every line printed here has to be a call the parent can actually make. The value placeholder
 * used to be one line for every kind — `"<one of the values below>"` — and a `Confirm` carries no
 * options, so it pointed at nothing: the parent had to already know the two words, which is the
 * one thing an envelope exists to make unnecessary. A confirm therefore prints its two values in
 * the call itself, and a `Text` question — which has no values either — leads with the field it is
 * actually answered in.
 *
 * A `Choice` that arrived with NO options is the same defect in the remaining kind, and it is a
 * shape that reaches here: `InquiryPayload.options` is optional and only the free-flight
 * `ask_user` tool enforces the "between 2 and max" rule, so nothing on the wire does. It is
 * therefore read as a text question in both directions — the call prints `text`, and
 * {@link QuestionEnvelopeModel.parseAnswer} takes text back — rather than pointing "below" at an OPTIONS section the
 * envelope will not print.
 *
 * The two confirm words are the same pair {@link QuestionEnvelopeModel.parseAnswer} reads back, and it reads them in any
 * case a parent sends, so a printed value is always an accepted one.
 */
const answerCalls = (inquiry: InquiryPayload): string[] => {
  const call = (body: string): string => `answer_question { "questionId": "${inquiry.id}", ${body} }`
  const lines: string[] = []

  if (inquiry.kind === ConnectInquiryKind.Confirm) {
    lines.push(
      `  ${call(`"answer": "${CONFIRM_YES}"`)}                        (they agreed)`,
      `  or ${call(`"answer": "${CONFIRM_NO}"`)}                      (they did not)`
    )
  } else if (inquiry.kind === ConnectInquiryKind.Text || !hasOptions(inquiry)) {
    lines.push(`  ${call('"text": "<what they said>"')}         (their own words)`)
  } else {
    lines.push(`  ${call('"answer": "<one of the values below>"')}`)
    if (inquiry.multiple === true) {
      lines.push(`  or ${call('"answer": ["<value>", "<value>"]')}   (several)`)
    }
    if (inquiry.allowText === true) {
      lines.push(`  or ${call('"text": "<what they said>"')}         (their own words)`)
    }
  }

  // Present on every question whatever its kind: a parent whose user is not available has to have
  // a way to say so, or it waits out the timeout or invents an answer.
  lines.push(`  or ${call('"declined": true')}                    (nobody can decide)`)

  return lines
}

/** The offered values, listed so a refusal is actionable without re-reading the envelope. */
const offered = (inquiry: InquiryPayload): string =>
  (inquiry.options ?? []).map(option => option.value).join(', ')

const asStrings = (value: unknown): string[] | null => {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value) && value.every(entry => typeof entry === 'string')) {
    return value as string[]
  }

  return null
}

/**
 * The ONE ceiling, refused rather than silently applied.
 *
 * Cutting the text here would hand the asker most of a decision and say nothing; the person is
 * still in front of the parent, so the honest answer is to ask them to be shorter and to say where
 * a longer answer belongs.
 */
const capText = (inquiry: InquiryPayload, answer: InquiryAnswerPayload): ParsedAnswer =>
  (answer.text?.length ?? 0) > CONNECT_INQUIRY_MAX_TEXT
    ? {
      problem: `Too long — send at most ${CONNECT_INQUIRY_MAX_TEXT} characters; put anything`
        + ' longer in the project instead.',
    }
    : { answer: { ...answer, inquiryId: inquiry.id } }

/** One question handed to a parent agent, and the answer it sends back checked against it. */
export const makeQuestionEnvelopeModel = (inquiry: InquiryPayload): QuestionEnvelopeModel => {
  const renderQuestionEnvelope = (_opts: QuestionEnvelopeOptions): string => {
    const traits = [
      ...(inquiry.multiple === true ? ['pick one or more'] : []),
      ...(inquiry.allowText === true ? ['their own words are accepted instead of an option'] : []),
    ]

    const lines: string[] = [
      `=== VIABLE QUESTION ${inquiry.id} ===`,
      `kind: ${inquiry.kind}${traits.length > 0 ? ` · ${traits.join(' · ')}` : ''}`,
      ...(inquiry.expiresAt != null ? [`expires: ${inquiry.expiresAt}`] : []),
      '',
      'HOW TO ANSWER THIS (do not answer it yourself):',
      'Put this question to the person you are working for, in your own words. It is a decision about',
      'THEIR project, and a guess here is a whole application built on the wrong assumption. If they',
      'are not available, say so — do not invent an answer.',
      '',
      'WHAT TO SEND BACK — call exactly:',
      ...answerCalls(inquiry),
      '',
      '--- THE QUESTION ---',
      inquiry.question,
    ]

    if (inquiry.context != null && inquiry.context !== '') {
      lines.push('--- BACKGROUND ---', inquiry.context)
    }

    if (inquiry.options != null && inquiry.options.length > 0) {
      lines.push('--- OPTIONS ---')
      for (const option of inquiry.options) {
        lines.push(`  ${option.value} — ${option.label}`)
        if (option.description != null && option.description !== '') {
          lines.push(`      ${option.description}`)
        }
      }
    }

    if (inquiry.default != null) {
      lines.push(
        '--- IF NOBODY ANSWERS ---',
        `The platform will assume: ${
          Array.isArray(inquiry.default) ? inquiry.default.join(', ') : inquiry.default
        }`
      )
    }

    lines.push(`=== END QUESTION ${inquiry.id} ===`)

    return lines.join('\n')
  }

  const parseAnswer = (raw: Record<string, unknown>): ParsedAnswer => {
    if (raw.declined === true) {
      return { answer: { inquiryId: inquiry.id, declined: true } }
    }

    const text = typeof raw.text === 'string' ? raw.text.trim() : ''
    const values = asStrings(raw.answer)
    const hasAnswer = raw.answer != null
    if (!hasAnswer && text === '') {
      return { problem: 'Send an answer, a text, or declined: true.' }
    }

    if (inquiry.kind === ConnectInquiryKind.Confirm) {
      // A boolean is accepted as readily as a word: the tool's own schema offers `answer` as a
      // string, and a model that sent `true` anyway has said exactly what was asked for.
      const said = typeof raw.answer === 'boolean'
        ? String(raw.answer)
        : values?.[0] ?? text
      const confirmed = CONFIRM_WORDS[said.trim().toLowerCase()]
      if (confirmed == null) {
        return { problem: `Answer this one with "${CONFIRM_YES}" or "${CONFIRM_NO}".` }
      }

      return { answer: { inquiryId: inquiry.id, value: confirmed } }
    }

    if (inquiry.kind === ConnectInquiryKind.Choice) {
      const known = new Set((inquiry.options ?? []).map(option => option.value))
      if (known.size < 1) {
        // A choice question that arrived carrying no choices. Nothing on the wire refuses one —
        // `options` is optional and only the free-flight `ask_user` tool enforces the 2..max rule —
        // and the value check below used to skip an empty set, so ANY string was recorded as a
        // chosen value the asker can match against nothing, while the refusal that did fire read
        // "one of the choices ()". The envelope prints `text` as the call for this shape, so text
        // is what is taken back; a value is refused by naming the field that works.
        return text !== ''
          ? capText(inquiry, { inquiryId: inquiry.id, text })
          : {
            problem: 'This question offers no choices — send `text` with what they said,'
              + ' or declined: true.',
          }
      }
      if (values == null || values.length < 1) {
        // Text alone is an answer only where the question said so. Elsewhere it is a value the
        // asker cannot match against anything it offered, and accepting it silently loses the
        // decision the person actually made.
        if (inquiry.allowText === true && text !== '') {
          return capText(inquiry, { inquiryId: inquiry.id, text })
        }

        return {
          problem: `Answer with one of the choices (${offered(inquiry)})`
            + `${inquiry.allowText === true ? ', or send `text` with what they said' : ''}.`,
        }
      }
      if (values.length > 1 && inquiry.multiple !== true) {
        return { problem: `This question takes ONE answer (${offered(inquiry)}).` }
      }

      for (const value of values) {
        if (!known.has(value)) {
          return { problem: `"${value}" is not one of the choices (${offered(inquiry)}).` }
        }
      }

      // Through the same ceiling as every other text: a chosen value may carry the person's own
      // words beside it, and that rider is the one path a length the wire schema refuses could
      // otherwise take — refused there, it costs a round trip on a question already answered.
      return capText(inquiry, {
        inquiryId: inquiry.id,
        value: inquiry.multiple === true ? values : values[0],
        ...(text !== '' ? { text } : {}),
      })
    }

    const said = text !== '' ? text : (values?.join('\n') ?? '').trim()
    if (said === '') {
      return { problem: 'Send what they said as `text`.' }
    }

    return capText(inquiry, { inquiryId: inquiry.id, text: said })
  }

  return { inquiry, renderQuestionEnvelope, parseAnswer }
}
