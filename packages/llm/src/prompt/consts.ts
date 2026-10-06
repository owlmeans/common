/**
 * Separator between rendered chunks. Every join in this file goes through it: the
 * composed prompt must be byte-identical between calls, so there is exactly one way to
 * glue things together.
 */
export const CHUNK_SEPARATOR = '\n\n'
