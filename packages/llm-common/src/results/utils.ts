import {
  CUMULATIVE_RESULTS_OMITTED_LEAD, CUMULATIVE_RESULTS_OMITTED_TAIL, CUMULATIVE_RESULTS_PREAMBLE,
} from './consts.js'
import type { CumulativeResults } from './types.js'

/** Separator between sections — the same two newlines every other prompt join uses. */
const SEPARATOR = '\n\n'

/**
 * A {@link CumulativeResults} view as prompt text, or `''` when there is nothing to say.
 *
 * Pure and total: the same view renders to the same bytes on every runtime, and an absent or empty
 * view renders to NOTHING — not a heading over an empty list, which a model would read as "no
 * earlier step produced anything" and act on. The view's digest is never rendered; its sections are
 * placed in the order the view holds them, which is oldest first.
 */
export const renderCumulativeResults = (view: CumulativeResults | null | undefined): string => {
  if (view == null) {
    return ''
  }
  const sections = view.sections.map(section => section.text.trim()).filter(text => text !== '')
  const omitted = view.omitted.filter(step => step.trim() !== '')
  if (sections.length === 0 && omitted.length === 0) {
    return ''
  }

  const parts = [CUMULATIVE_RESULTS_PREAMBLE, ...sections]
  if (omitted.length > 0) {
    parts.push(
      `${CUMULATIVE_RESULTS_OMITTED_LEAD} ${omitted.map(step => `\`${step}\``).join(', ')}. `
      + CUMULATIVE_RESULTS_OMITTED_TAIL,
    )
  }

  return parts.join(SEPARATOR)
}
