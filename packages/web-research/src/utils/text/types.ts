/** Text primitives the steps share — caps, one-line excerpts, the sentence a match sits in, safe names. */
export interface TextUtils {
  /** At most `max` characters, cut at a line or word boundary, closed by a marker naming the cut. */
  cap: (text: string, max: number) => string
  /** One line of at most `max` characters — whitespace collapsed, cut at a word. */
  line: (text: string, max: number) => string
  /** The sentence (or list item / line) the character range `[at, at + length)` sits in, one line. */
  sentenceAt: (text: string, at: number, length: number) => string
  /** How many words a text holds. */
  words: (text: string) => number
  /** Whitespace collapsed, trimmed, lower-cased — how a quote is looked up in a document. */
  squash: (text: string) => string
  /** A storable path segment: unsafe characters replaced, long or changed names suffixed with a digest. */
  segment: (text: string) => string
  /** A short hex digest of a text. */
  digest: (text: string) => string
}
