/** One run of a sentence: plain text, or a link. */
export interface TextPart {
  text: string
  href?: string
  /** The placeholder this part replaced, for a link. */
  key?: string
}

export interface TextLink {
  text: string
  href: string
}

/**
 * Placeholders in an already-translated sentence. Translations keep `{{name}}` untouched when no
 * value is passed (i18next's `skipOnVariables`), and an app's own `translate` has no values at
 * all — so every package string is filled here, the same way whichever translator produced it.
 */
export interface TextUtils {
  /** Replace every `{{name}}` that `values` names; others stay as they are. */
  fill: (template: string, values: Record<string, string | number>) => string
  /** Split a sentence around the `{{name}}` placeholders `links` names, turning each into a link. */
  parts: (template: string, links: Record<string, TextLink>) => TextPart[]
}
