/** The names a scaffolded app is given: its package slug, language, title and description. */
export interface NamingHelper {
  /** Whether a string is an npm-safe package slug (`SLUG_PATTERN`). */
  isValidSlug: (slug: string) => boolean
  /** Whether a string has the loose BCP-47 shape of `LANG_PATTERN`. */
  isValidLang: (lang: string) => boolean
  /** A package slug derived from a target directory; `owlmeans-app` when nothing usable is left. */
  slugify: (input: string) => string
  /** `my-app` → `My App`. */
  titleize: (slug: string) => string
  /** The one-line description an app gets when none is given. */
  defaultDescription: (name: string) => string
}
