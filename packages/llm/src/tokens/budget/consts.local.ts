/**
 * Special-token strings (`<|endoftext|>` …) in a text are counted as the plain text they are: the
 * tokenizer otherwise throws on them, and an uploaded document may well mention one.
 */
export const ENCODE_OPTIONS = Object.freeze({ disallowedSpecial: new Set<string>() })

/** Where a paragraph ends: a blank line. */
export const PARAGRAPH_BREAK = /\n[ \t]*\n/g

/** Where a sentence ends: terminal punctuation (and closing quotes) before whitespace, or CJK full stops. */
export const SENTENCE_END = /[.!?…]+["'”’»)\]]*(?=\s|$)|[。！？]+/gu

/** Where a line ends — the boundary of a list item. */
export const LINE_BREAK = /\n/g
