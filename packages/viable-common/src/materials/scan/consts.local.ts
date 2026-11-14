/** The schemes a reference link may have. */
export const LINK_PROTOCOLS: readonly string[] = Object.freeze(['http:', 'https:', 's3:'])

/**
 * A URL candidate in prose: a scheme, then everything up to whitespace or a character no link
 * carries unescaped — quotes, angle, square and curly brackets, the backtick, the pipe, the
 * backslash, the caret. Round brackets stay: `/wiki/A_(b)` is a link; an unbalanced one is trimmed.
 */
export const URL_CANDIDATE = /(?:https?|s3):\/\/[^\s<>"'`[\]{}|\\^]+/giu

/** What may end a sentence after a link but never ends a link. */
export const TRAILING_JUNK = new Set([
  '.', ',', ';', ':', '!', '?', '*', '_', '~', '»', '”', '’', '“', '‘', '…', '—', '–', '。', '，', '、', '！', '？', '：', '；',
])

/** Closing brackets and the opening one each must balance. */
export const BRACKETS: Readonly<Record<string, string>> = Object.freeze({ ')': '(' })

/** A word and what separates words, after folding. */
export const WORD = '[\\p{L}\\p{N}]'
export const SEPARATOR = '[^\\p{L}\\p{N}]+'

/** The gap token of the lexicon. */
export const GAP_TOKEN = '…'
