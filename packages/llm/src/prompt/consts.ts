/**
 * Separator between rendered chunks. Every join in this file goes through it: the
 * composed prompt must be byte-identical between calls, so there is exactly one way to
 * glue things together.
 */
export const CHUNK_SEPARATOR = '\n\n'

/**
 * Opens the project message. Project facts travel in a user turn rather than in the system
 * message — that is what lets the system prefix be shared across steps and stories — and a user
 * turn carries less weight than system text, so the header says how much these facts count.
 */
export const PROJECT_CONTEXT_HEADER = 'Project context — facts about this project; they override general guidance where they differ.'
