/** Text, charset and URL helpers. Library-private. */
export interface TextUtils {
  /** Whitespace runs collapsed to one space, trimmed. */
  collapse: (text: string | null | undefined) => string
  /**
   * The readable text of a node: script, style and template content skipped, a space at every
   * block boundary (so a heading and the label after it do not run together), collapsed.
   */
  textOf: (node: Node | null | undefined) => string
  /** At most `max` characters, cut at a word boundary with an ellipsis. */
  truncate: (text: string, max: number) => string
  /**
   * Decode a body: the charset from the content type, else a `<meta charset>` / BOM sniff of the
   * first bytes, else UTF-8. An unknown label falls back to UTF-8 instead of throwing.
   */
  decode: (bytes: Uint8Array, contentType: string | null | undefined) => { text: string, charset: string }
  /** An absolute http(s) URL, or `undefined` for anything else (`javascript:`, `data:`, junk). */
  absolute: (href: string | null | undefined, base: string) => string | undefined
  /** The registrable-ish host of a URL, lower-cased, without `www.`. */
  siteOf: (url: string) => string
}
