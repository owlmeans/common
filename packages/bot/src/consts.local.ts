/**
 * One token of `word` matching: letters, combining marks, digits and `_`. Marks are part of the word
 * (Devanagari vowel signs, a decomposed accent left after folding), so a word never splits on one.
 */
export const BOT_TOKEN_PATTERN = /[\p{L}\p{M}\p{N}_]+/gu

/** Any whitespace run — collapsed to one space before a `contains` comparison and in a stored keyword. */
export const BOT_SPACE_PATTERN = /\s+/gu

/**
 * A `/command`, optionally addressed `@ToBot`, ending at whitespace or at the end of the text, then
 * its arguments.
 */
export const BOT_COMMAND_PATTERN = /^\/([\p{L}\p{N}_-]{1,64})(?:@([\p{L}\p{N}_.]{1,64}))?(?:\s+([\s\S]*))?$/u
