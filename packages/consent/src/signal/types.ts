import type { ConsentOptions, ConsentRecord } from '../types.js'

/**
 * Something that tells the page's tags what the visitor decided, in the protocol those tags read —
 * a tag vendor's consent API, a pixel's own switch.
 *
 * This package names no such protocol: a provider lives in its own package (the tag packages of
 * OwlMeans connect), is registered explicitly with `consentSignalHelper.register` and is driven by
 * the store — `defaults` once before anything is read, `apply` with every decision. With no provider
 * registered the store still stores, opens and decides, writes the category globals and dispatches
 * `CONSENT_EVENT`; it simply signals nothing.
 */
export interface ConsentSignalProvider {
  /** Stable identity. Registering the same id again REPLACES the earlier provider. */
  id: string
  /**
   * Declare the pre-decision state, before any tag can act: everything optional denied. Called by
   * `consentStore.init` on every init — a provider that must declare once per document keeps its
   * own idempotence (a window flag, since a page may carry an inline head bootstrap AND a bundle).
   */
  defaults: (opts: ConsentOptions) => void
  /**
   * Signal a decision. Called after the category globals are written and before `CONSENT_EVENT` is
   * dispatched, for a stored record on init, an automatic decision and every save.
   */
  apply: (record: ConsentRecord, opts: ConsentOptions) => void
  /**
   * The provider's inline `<head>` script: its defaults and a stored record's decision, run before
   * any bundle — the only placement a tag that reads the state present when it loads can honour.
   * A provider package composes it into its own head output; this package never stamps it. It
   * follows the inline discipline of `consentTrackingHelper.consentBootstrapScript` (dynamic values
   * JSON-encoded; escaping `</script` in the composed result is the caller's job).
   */
  bootstrapScript?: (opts?: ConsentOptions) => string
}

/**
 * The document's signal-provider host: the registry, and the two moments the store drives every
 * registered provider at.
 */
export interface ConsentSignalHelper {
  /** Register a provider — replace by id. Explicit, never a side effect of importing a package. */
  register: (provider: ConsentSignalProvider) => void
  /** Remove a provider by id. */
  unregister: (id: string) => void
  /** The provider registered under `id`, or `null`. */
  get: (id: string) => ConsentSignalProvider | null
  /** Every registered provider, in registration order. */
  list: () => ConsentSignalProvider[]
  /** Remove every provider — for tests. */
  clear: () => void
  /**
   * Every provider's `defaults`. Nothing outside a browser, and nothing under `silent`. A provider
   * that throws never stops the others.
   */
  defaults: (opts?: ConsentOptions) => void
  /**
   * Apply a decision to the page: the category globals first (`ConsentCategory.globalVar`), then
   * every provider's `apply`, then `CONSENT_EVENT` with `detail.record`.
   *
   * The order is load-bearing. A tag that fires on a provider's update reads the globals in the same
   * turn, so writing them afterwards would let the first firing see the previous answer; and a gate
   * that hears the event loads a tag only after every provider has spoken. Nothing outside a browser,
   * and nothing at all under `silent`. A provider that throws never stops the others or the event.
   */
  apply: (record: ConsentRecord, opts?: ConsentOptions) => void
}
