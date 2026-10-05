import { truncateAt } from '@owlmeans/agent-common'
import { logger } from '@owlmeans/log'
import type { RollingSummaryInput } from './rolling/types.js'

const log = logger('agent')

/**
 * Fold one event into a running account of a subject, under a hard character ceiling.
 *
 * **Never throws.** When the model is unavailable or refuses, the previous prose is kept and
 * head-truncated to make room rather than being replaced by an error or dropped: the caller's own
 * verbatim record of the event is what preserves the fact, so a failed fold costs detail, never
 * the event itself. That is the property that lets a caller record history unconditionally.
 */
export const composeRollingSummary = async (input: RollingSummaryInput): Promise<string> => {
  const { model, previous, event, details, maxChars, action = 'agent-rolling-summary' } = input

  const trimmedPrevious = previous.trim()
  const fallback = (): string => trimmedPrevious === ''
    ? truncateAt(event, maxChars)
    : truncateAt(trimmedPrevious, maxChars)

  if (model == null) {
    return fallback()
  }

  try {
    const result = await model.ask(
      `
Update the running account of a project with the event below.

Write ONE account that covers the project's whole life so far, at most ${maxChars} characters. Keep
what still matters — what the project is, the decisions taken, what has been built, what failed and
was not repaired. Drop detail that later events made irrelevant. Prefer losing old detail to losing
recent facts.

Facts only. No preamble, no headings, no addressing the reader, no speculation about what happens
next. Plain prose paragraphs.

# The account so far
${trimmedPrevious === '' ? '(nothing recorded yet)' : trimmedPrevious}

# What just happened
${event}${details != null && details !== '' ? `\n\n# Detail\n${details}` : ''}
      `,
      { action },
    )

    const summary = truncateAt(result ?? '', maxChars)

    return summary === '' ? fallback() : summary
  } catch (e) {
    log.warn('Rolling summary fold failed, keeping the previous account', e)
    return fallback()
  }
}
