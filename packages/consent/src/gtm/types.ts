import type { ConsentCategory, ConsentOptions, ConsentRecord } from '../types.js'

/** Google Consent Mode: the queue, the signals a decision implies, and the inline scripts. */
export interface ConsentModeHelper {
  /**
   * Push onto the tag-manager queue in the shape Google's own snippet uses.
   *
   * `arguments`, not an array literal. Both work with today's Consent API, but `arguments` is what
   * `gtag.js` itself emits, and a page that carries both this and Google's snippet should not have
   * two shapes in one queue.
   */
  gtagConsent: (..._args: unknown[]) => void
  /** Every signal the configured categories drive, at its pre-consent value. */
  consentDefaults: (categories?: ConsentCategory[]) => Record<string, 'granted' | 'denied'>
  /** Every signal, at the value this record implies. */
  consentUpdate: (record: ConsentRecord, categories?: ConsentCategory[]) => Record<string, 'granted' | 'denied'>
  /**
   * Declare what is denied, before any tag can act.
   *
   * Idempotent through a window flag, because the page may carry this call twice — once inline in
   * the document head, once from whatever bundle mounts the dialog — and a second `default` after a
   * tag has loaded is worse than none: it can widen what was already narrowed.
   */
  pushConsentDefaults: (opts?: ConsentOptions) => void
  /**
   * Apply a decision: globals first, then the signal update, then any per-category events.
   *
   * The order is load-bearing. A tag that fires on the update event reads the globals in the same
   * turn, so writing them afterwards would let the first firing see the previous answer.
   */
  applyConsent: (record: ConsentRecord, opts?: ConsentOptions) => void
  /**
   * Whether a stored decision grants tracking at all — a signal-bearing category, not merely the
   * required essential one.
   *
   * "Signal-bearing" is what a required category can never be: it exists to gate whether a LOADER
   * runs, and a required category is disclosure, not a question — everyone gets it. Only a category
   * that both is optional and drives at least one Consent Mode signal counts, which is exactly what
   * `googleTagHeadScript`'s `'basic'` mode gates a Google tag behind.
   */
  trackingGranted: (record: ConsentRecord | null, categories?: ConsentCategory[]) => boolean
  /**
   * The inline script a document stamps ABOVE its tag-manager snippet.
   *
   * It exists because the defaults have to be on the queue before `gtm.js` loads, and a React bundle
   * cannot be: by the time an island mounts, the container has been running for hundreds of
   * milliseconds and has already decided what it may do. Emitting it from the HTML is the only
   * ordering that holds — and it reads the stored record too, so a returning visitor's tags are not
   * denied for the first paint of every page.
   */
  consentBootstrapScript: (opts?: ConsentOptions) => string
  /**
   * Withhold a loader until a stored or later decision grants tracking.
   *
   * The counterpart to `consentBootstrapScript` for the `'basic'` gated loading mode
   * (`@owlmeans/web-gtm`'s `GOOGLE_TAG_DEFAULT_MODE`): where the bootstrap always declares Consent
   * Mode's defaults so a tag may load cookieless, this withholds the tag itself — the loader string
   * is only ever reached once `trackingGranted` is true, either because a returning visitor's stored
   * record already says so, or because `applyConsent` later dispatches {@link CONSENT_EVENT} with
   * one that does. The listener removes itself on the first passing event, so the loader — which
   * marks its own element and refuses to run twice — is asked to run at most once from here.
   *
   * `loaderExpr` is a complete statement or expression that runs the loader when reached — the
   * self-invoking IIFE string `googleTagHeadScript`'s `gtagScript`/`gtmContainerScript` already
   * produce, embedded here verbatim rather than called. It is placed inline exactly as
   * `consentBootstrapScript`'s own output is: dynamic values (the storage key, the category shape,
   * the event name) are JSON-encoded so nothing configured can break out of a string literal, and
   * escaping the RESULT for HTML (`</script`, `<!--`) is left to whoever composes the final inline
   * script — the same discipline `consentBootstrapScript` follows, and `googleTagHeadScript` already
   * applies to the whole script it stamps.
   */
  consentGateScript: (loaderExpr: string, opts?: ConsentOptions & { categories?: ConsentCategory[] }) => string
}
