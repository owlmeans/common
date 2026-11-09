/**
 * The longest warning, error or build diagnostic a structured result carries. The text result keeps
 * the whole of it; the structured one is what a host shows a person in a card.
 */
export const WARNING_CAP = 2_000

/** The longest story narrative, prompt or question context a structured result carries. */
export const NARRATIVE_CAP = 4_000

/** A frame line of a stack trace — never carried in a structured result. */
export const STACK_FRAME = /^\s+at\s/

/** The address a locally run application answers on, given its port. */
export const LOCAL_ORIGIN = 'http://localhost:'

/**
 * A batch story's state while it has no outcome: the one in progress (or, once the batch settled,
 * the one it started and never finished), the ones still queued, and the ones it never reached.
 */
export const BATCH_STORY_PENDING = Object.freeze({
  current: 'in-progress',
  currentSettled: 'started',
  queued: 'queued',
  unreached: 'not-started',
})
