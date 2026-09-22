import { TITLE_MAX } from '@owlmeans/planning'

/**
 * The sentence a landing story's narrative carries — what a person reading the board sees.
 *
 * The AUTHORITY is the card's `fields.landing` flag, never this text: the design and development
 * stages key on the flag, and a person may reword the narrative at any time. The sentence exists so
 * the board says in plain words why this story is different, and so the analyst and the designer,
 * who read the narrative, write a screen that continues what the guest started.
 *
 * A constant, byte for byte, because {@link hasLandingSentence} is how a resumed decision step
 * knows it already appended it.
 */
export const LANDING_STORY_SENTENCE = 'A visitor can start this on the landing page without an account;'
  + ' after signing in they continue here with their choices carried over.'

const normalized = (text: string): string => text.replace(/\s+/g, ' ')

/** Whether a narrative already carries the landing sentence, whatever whitespace surrounds it. */
export const hasLandingSentence = (title: string): boolean =>
  normalized(title).includes(LANDING_STORY_SENTENCE)

/**
 * The narrative with the landing sentence appended once.
 *
 * Idempotent — a narrative that already carries the sentence comes back unchanged, so a decision
 * step that is resumed after it wrote the card never appends a second copy. It never produces a
 * title longer than a card accepts (`TITLE_MAX`): a narrative with no room left is returned as it
 * is rather than cut, because a person's words are worth more than the note, and the flag on the
 * card still carries the fact.
 */
export const withLandingSentence = (title: string): string => {
  if (hasLandingSentence(title)) {
    return title
  }
  const base = title.trimEnd()
  if (base === '') {
    return LANDING_STORY_SENTENCE
  }
  const joined = `${base} ${LANDING_STORY_SENTENCE}`

  return joined.length > TITLE_MAX ? title : joined
}
