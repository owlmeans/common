import { ConnectInquiryKind, CONNECT_INQUIRY_MAX_TEXT } from '@owlmeans/viable-common'
import type { ConnectHarness, InquiryAnswerPayload, InquiryPayload } from '@owlmeans/viable-common'

/**
 * The two values a confirmed and a refused question answer with.
 *
 * Mirrors `CONFIRM_YES` / `CONFIRM_NO` in `@owlmeans/llm-common` — the package that reads the
 * answer — value for value, and is deliberately a copy rather than an import: this package is
 * installed by developers to drive their own machine and must not carry the model runtime, which
 * is the same reason {@link ConnectInquiryKind} mirrors `InquiryKind`. The two must stay equal, or
 * a person's "yes" reaches the asker as a value it has never heard of.
 */
export const CONFIRM_YES = 'yes'
export const CONFIRM_NO = 'no'

/** What a parent may send for a confirm question, beyond the two values themselves. */
const CONFIRM_WORDS: Record<string, string> = {
  yes: CONFIRM_YES,
  y: CONFIRM_YES,
  true: CONFIRM_YES,
  ok: CONFIRM_YES,
  no: CONFIRM_NO,
  n: CONFIRM_NO,
  false: CONFIRM_NO,
}

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
 * {@link parseAnswer} takes text back — rather than pointing "below" at an OPTIONS section the
 * envelope will not print.
 *
 * The two confirm words are the same pair {@link parseAnswer} reads back, and it reads them in any
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

export interface QuestionEnvelopeOptions {
  /** Which parent agent is reading this. Recorded rather than branched on — see below. */
  harness: ConnectHarness
}

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
export const renderQuestionEnvelope = (
  inquiry: InquiryPayload, _opts: QuestionEnvelopeOptions
): string => {
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

export interface ParsedAnswer {
  answer?: InquiryAnswerPayload
  /** Present when what came back is not something this question can accept. Quoted back verbatim. */
  problem?: string
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
export const parseAnswer = (
  inquiry: InquiryPayload, raw: Record<string, unknown>
): ParsedAnswer => {
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
