import type { REFERENCE_CUE_LANGUAGES } from './consts.js'
import type { ReferenceScan } from '../types.js'

/** Kept as a type: a union of the languages the research cue lexicon covers (the manager's eight). */
export type ReferenceCueLanguage = typeof REFERENCE_CUE_LANGUAGES[number]

/**
 * Finds the references a person's text points at — the links and whether it asks for online
 * research — so a create can announce them before any model runs.
 *
 * Pure and browser-safe: no network, no clock, no locale. Recall over precision on the research
 * cue: a false positive costs one model decision later, a false negative loses the request.
 */
export interface ReferenceScanHelper {
  /**
   * A URL as the ledger keys it, or `null` when it is not a link the platform follows: http(s) or
   * `s3://` with a host, at most `MATERIAL_LINK_URL_MAX` characters. The scheme and the host are
   * lower-cased, a default port, the fragment, credentials and an empty query dropped; the path
   * and the query keep their case.
   */
  normalize: (url: string) => string | null
  /**
   * The distinct normalized http(s) and `s3://` URLs of a text, in order of appearance: markdown
   * links and autolinks read, trailing punctuation, quotes and unbalanced closing brackets stripped,
   * over-long ones dropped.
   */
  urls: (text: string) => string[]
  /**
   * Whether the text asks for online research ("search online", "look it up", "найди в интернете",
   * "recherchiere", …) — `REFERENCE_RESEARCH_CUES`, case- and diacritics-insensitive, on whole
   * words; the URLs of the text are not read for cues.
   */
  research: (text: string) => boolean
  /** Both at once. */
  scan: (text: string) => ReferenceScan
}
