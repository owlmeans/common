import type { FixedText, LegalText } from '../types.js'

/** Interface strings and legal copy in a FIXED language, independent of the active i18next one. */
export interface FixedTextHelper {
  /**
   * The package's own interface strings (`web-payment`, library tier, any application override
   * included) in a FIXED language, merged key by key over English — no i18next instance and no
   * draining (`resolveI18nResource`). What lets a consumer-rights dialog render wholly in the
   * contract language while the rest of the page stays in the interface language.
   */
  paymentTextOf: (lng: string) => FixedText
  /**
   * The legal copy of `@owlmeans/payment` (`payment-consumer-rights`) in a fixed language. A text
   * that cannot be rendered in the language (a broken application override) falls back to English
   * rather than blanking the page; one that cannot be rendered at all is `''`.
   */
  legalTextOf: (lng: string) => LegalText
  /** A language's own name in another language (`de` in `en` → "German"); the code when unknown. */
  languageNameOf: (lng: string, inLanguage: string) => string
}
