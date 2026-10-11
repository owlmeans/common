import type { InquiryTab, InquiryWidgetConfig, LocalizedText } from '../types.js'

/** Reading and checking an `InquiryWidgetConfig` — the same rules in the widget, the SDK and a server. */
export interface InquiryConfigHelper {
  /**
   * The text of `value` in `language`: the exact tag, then its primary subtag (`pt-BR` → `pt`),
   * then `fallback`, then the first entry; `''` for `undefined`.
   */
  text: (value: LocalizedText | undefined, language: string, fallback?: string) => string
  /**
   * Everything wrong with a config, as English sentences; `[]` when it is usable. Checks the id
   * and every alias against `INQUIRY_ALIAS_PATTERN`, at least one and at most `INQUIRY_MAX_TABS`
   * tabs, unique aliases, non-empty titles within their caps, `defaultTab` naming a tab, and legal
   * links that are absolute http(s) URLs or root-relative paths.
   */
  validate: (config: InquiryWidgetConfig) => string[]
  /** The tab `alias` names, else `defaultTab`'s, else the first; `undefined` only without tabs. */
  tabOf: (config: InquiryWidgetConfig, alias?: string) => InquiryTab | undefined
  /**
   * The supported language closest to `language` — its primary subtag, lower case — or `fallback`
   * (`INQUIRY_FALLBACK_LANGUAGE`) when that is not among `supported` (`INQUIRY_LANGUAGES`).
   */
  normalizeLanguage: (language: string | undefined | null, supported?: readonly string[], fallback?: string) => string
}
