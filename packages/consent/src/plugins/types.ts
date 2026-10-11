import type { ConsentGeoLocation, ConsentOptions, ConsentPlugin, ConsentRecord } from '../types.js'

/** The document's consent-plugin registry and the hooks run over every registered plugin. */
export interface ConsentPluginHelper {
  /** Register a plugin. Replace-by-alias; sorted by priority (higher first) on every read. */
  registerConsentPlugin: (plugin: ConsentPlugin) => void
  /** Remove a plugin by alias — for a test, or an application tearing a locator down. */
  unregisterConsentPlugin: (alias: string) => void
  /** Every registered plugin, priority-sorted (higher first, ties keep insertion order). */
  consentPlugins: () => ConsentPlugin[]
  /**
   * Ask every registered plugin to decorate `url` with this document's decision, in priority order,
   * stopping at the first one that actually changes it. A plugin whose own rules refuse (a foreign
   * host, a `noreferrer` link, no local decision yet) returns `null` and is skipped, not an error.
   */
  decorateConsentUrl: (url: string | URL, record: ConsentRecord | null, opts: ConsentOptions) => URL
  /**
   * Every domain this document's decision is disclosed to, current host first, deduplicated — what a
   * dialog or a policy page lists. A plugin that runs on this host but names no domains of its own
   * (nothing registered, or `domains` not implemented) leaves the list at just the current host,
   * which is always correct to show even with no plugin at all.
   */
  consentDomains: (opts: ConsentOptions) => string[]
  /** Try every registered plugin's `adopt`, in priority order, and use the first decision offered. */
  adoptConsent: (opts: ConsentOptions) => ConsentRecord | null
  /**
   * Try every registered plugin's `adoptLanguage`, in priority order, and use the first language
   * offered. The caller persists it (`writeConsentLanguage`) — and has to do that BEFORE its i18n
   * layer reads storage, which is why the inline `<head>` fragment (`consentLinkerScript`) is the
   * one that normally does.
   */
  adoptConsentLanguage: (opts: ConsentOptions) => string | null
  /** Run every registered plugin's `start`, in priority order. `consentStore.init` calls this once. */
  startConsentPlugins: (opts: ConsentOptions) => void
  /**
   * Ask every registered plugin's `locate`, in priority order, for the visitor's country: the first
   * usable ISO alpha-2 code wins (upper-cased). A throw, or a code that names no country
   * (`CONSENT_GEO_UNKNOWN`, anything malformed), hands over to the next locator; with none left it
   * rejects with the last failure. Timeouts are the caller's (`consentGeoHelper.decide`).
   */
  locateConsent: (opts: ConsentOptions) => Promise<ConsentGeoLocation>
}
