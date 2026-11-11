import type { ConsentCategory, ConsentOptions, ConsentRecord } from '../types.js'

/**
 * Whether tracking is granted, and the inline `<head>` scripts that act on a stored decision before
 * any bundle exists — what a page stamps whatever tag, if any, it runs.
 *
 * Every inline script follows one discipline: dynamic values (the storage key, the category shape,
 * the event name) are JSON-encoded so nothing configured can break out of a string literal, and
 * escaping the RESULT for HTML (`</script`, `<!--`) is left to whoever composes the final inline
 * script.
 */
export interface ConsentTrackingHelper {
  /**
   * Whether a stored decision grants tracking at all: an optional category marked
   * `tracking: true` is granted in the record.
   *
   * A required category never counts — it is disclosure, not a question, and everyone has it —
   * so the default essential category grants nothing here while `analytics` or `marketing` does.
   */
  trackingGranted: (record: ConsentRecord | null, categories?: ConsentCategory[]) => boolean
  /**
   * The inline script a document stamps first in its `<head>` when it runs no signal provider's own
   * bootstrap: the linker's adopt-and-strip fragment (with `opts.linker`), then the stored record —
   * an automatic one past `CONSENT_AUTO_MAX_AGE` skipped — written onto the category globals, so a
   * snippet that reads a global sees a returning visitor's answer on the first paint.
   *
   * It declares no signal: a page whose tag needs its vendor's defaults in place before it loads
   * stamps that provider's head bootstrap instead (it carries all of this too).
   */
  consentBootstrapScript: (opts?: ConsentOptions) => string
  /**
   * Withhold a loader until a stored or later decision grants tracking.
   *
   * The loader string is reached only once {@link trackingGranted} holds — either because a
   * returning visitor's stored record already says so (an automatic decision past its age does not),
   * or because `consentSignalHelper.apply` later dispatches `CONSENT_EVENT` with one that does. The
   * listener removes itself on the first passing event, so the loader — which marks its own element
   * and refuses to run twice — is asked to run at most once from here.
   *
   * `loaderExpr` is a complete statement or expression that runs the loader when reached — a
   * self-invoking IIFE, embedded verbatim rather than called.
   */
  consentGateScript: (loaderExpr: string, opts?: ConsentOptions) => string
  /**
   * Inline building block: declares `raw`, the stored record's JSON text — localStorage first, the
   * cookie second, the order `consentStorageHelper.readConsent` uses — or `null`. Expects the window
   * as `w` and the document as `d` in scope. For a provider package composing its own head
   * bootstrap over the same storage contract.
   */
  storageReadScript: (opts?: ConsentOptions) => string
  /**
   * Inline building block: runs `onStale` when the parsed record `r` in scope is an automatic
   * decision past `CONSENT_AUTO_MAX_AGE` (or stamped in the future beyond the allowed skew) — the
   * store holds such a record back until the visitor is located again, and a head script must not
   * apply what the store will not.
   */
  staleAutoScript: (onStale: string) => string
}

/**
 * @deprecated compat:consent-signals — the provider-free members of the helper this package used to
 * export; use `consentTrackingHelper` and `consentSignalHelper`. Kept so a generated target's build
 * script that imports it keeps building.
 */
export interface ConsentModeHelper extends Pick<ConsentTrackingHelper, 'trackingGranted' | 'consentBootstrapScript' | 'consentGateScript'> {
  /** @deprecated use `consentSignalHelper.defaults(opts)`. */
  pushConsentDefaults: (opts?: ConsentOptions) => void
  /** @deprecated use `consentSignalHelper.apply(record, opts)`. */
  applyConsent: (record: ConsentRecord, opts?: ConsentOptions) => void
}
