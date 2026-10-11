/**
 * The one slot of a `single` resource. It is a KEY and never a value: nothing writes it into a
 * record, so a single resource's record still carries whatever id it arrived with, or none.
 */
export const SOLE = ''

/** The channel writes publish on, and the one a subscriber gets when it names none. */
export const CHANGES = 'changes'

/** The alias a context's first state resource takes when nothing else is asked for. */
export const STATE = 'state'
