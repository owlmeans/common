/** The marker a capped text ends with; `{n}` is the number of characters left out. */
export const CAP_MARKER = '\n[… {n} more characters …]'

/** How far a citing sentence may reach on either side of the match before it is cut. */
export const SENTENCE_REACH = 400

/**
 * Where a citing sentence ends: a full stop, or a line break that starts a new block — a blank line, a
 * list item, a heading, a quote, a table row. A hard-wrapped list item's next line is the same sentence.
 */
export const SENTENCE_END = /[.!?](?=\s|$)|\n(?=[ \t]*(?:[-*+][ \t]|\d+[.)][ \t]|#|>|\||\n|$))/

/** Where a citing sentence starts, read backwards: the same boundaries, the break included. */
export const SENTENCE_START = /[.!?](?=\s)|\n(?=[ \t]*(?:[-*+][ \t]|\d+[.)][ \t]|#|>|\||\n))/g

/** Characters a path segment of the source area keeps; anything else becomes `-`. */
export const SEGMENT_UNSAFE = /[^A-Za-z0-9._-]+/g

/** The longest path segment kept before a digest replaces its tail. */
export const SEGMENT_CHARS = 64
