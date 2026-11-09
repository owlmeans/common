import type { ToolPresentation, ToolProfileText } from '../types.js'

/** One wording rule of a listing: every match of `pattern` (a global expression) said as `replace`. */
export interface ListingTextRule {
  pattern: RegExp
  replace: string
}

/** What a listing says of one tool beyond the catalogue: its annotations always, its title and description where they differ. */
export interface ListingToolPresentation extends Pick<ToolPresentation, 'title' | 'description' | 'annotations'> {}

/**
 * How a listing says a text: the billing addresses and the top-up call to action out, a split tool
 * named by the variant that answers (or by all its variants), the task loop it never offers by the
 * status to read instead. A file's own content is never rewritten.
 */
export interface ListingTextHelper {
  rewrite: ToolProfileText
}
