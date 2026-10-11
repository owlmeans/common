/** The landing sentence a landing-gate story's narrative carries. */
export interface LandingSentenceHelper {
  /** Whether a narrative already carries the landing sentence, whatever whitespace surrounds it. */
  hasLandingSentence: (title: string) => boolean
  /**
   * The narrative with the landing sentence appended once.
   *
   * Idempotent — a narrative that already carries the sentence comes back unchanged, so a decision
   * step that is resumed after it wrote the card never appends a second copy. It never produces a
   * title longer than a card accepts (`TITLE_MAX`): a narrative with no room left is returned as it
   * is rather than cut, because a person's words are worth more than the note, and the flag on the
   * card still carries the fact.
   */
  withLandingSentence: (title: string) => string
}
