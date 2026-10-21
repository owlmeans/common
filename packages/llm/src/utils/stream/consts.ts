/**
 * After a `finish_reason`, how many more reads a stream gets — and within how long, at most — to
 * deliver its usage. Chat Completions (and every compatible endpoint) sends the token counts in a
 * chunk of their own AFTER the one that finishes; stopping at the finish dropped them, and the
 * call was billed as nothing. The window is fixed, never re-armed by what arrives in it.
 */
export const STREAM_DRAIN_READS = 8

export const STREAM_DRAIN_MS = 10_000
