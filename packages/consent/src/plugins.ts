import type { ConsentOptions, ConsentRecord } from './types.js'

/**
 * An extension seam for `@owlmeans/consent`: something that reacts to this document's consent
 * decision, or supplies one from elsewhere, without the core store knowing anything about where
 * that decision came from.
 *
 * `consentLinker` (`./linker.js`) is the one built-in plugin — cross-domain consent through
 * decorated links — but nothing here is specific to it. A registry rather than a fixed option on
 * `ConsentOptions` because the store has zero dependencies today and stays that way: a plugin is
 * opt-in code an application imports for its own reason, never a bundled feature this package
 * pulls in whether or not anything uses it.
 */
export interface ConsentPlugin {
  /** Stable identity. Registering the same alias again REPLACES the earlier plugin. */
  alias: string
  /** Run order when more than one plugin implements the same hook. Higher first. Defaults to 0. */
  priority?: number
  /** Installed once, the first time `consentStore.init` runs with this plugin registered. */
  start?: (opts: ConsentOptions) => void
  /**
   * Offer a decision from outside this document's own storage — e.g. one carried on the URL that
   * led here. Returns a full record to adopt, or `null` to defer to the next plugin / the ordinary
   * "ask" path. Never called once a stored record already exists.
   */
  adopt?: (opts: ConsentOptions) => ConsentRecord | null
  /**
   * Offer an interface language from outside this document's own storage — e.g. the one the page
   * that led here was read in. Returns a language the application supports, or `null` to keep
   * choosing its own. Only a CANDIDATE: it says what the link carried, and persisting it is
   * `writeConsentLanguage`'s call, which refuses until `functional` is granted on this document.
   */
  adoptLanguage?: (opts: ConsentOptions) => string | null
  /**
   * Rewrite an outgoing URL to carry this document's current decision — and its language — or
   * `null` to leave it untouched (a foreign host, a link that opts out, nothing to carry yet).
   * `record` is `null` while the visitor has not decided: a plugin that also carries something
   * else (the language) still has a reason to decorate then.
   */
  decorate?: (url: URL, record: ConsentRecord | null, opts: ConsentOptions) => URL | null
  /** Extra domains this decision is understood to apply to, for disclosure — never deduplicated here. */
  domains?: (opts: ConsentOptions) => string[]
}

/**
 * Module-global by design, like `@owlmeans/client-auth/login`'s method/step registries: consent is
 * one thing per document, not per component tree, and a plugin is installed once at bundle scope
 * (an Astro island, a script tag, a React app) regardless of how many components read the store.
 */
const plugins = new Map<string, ConsentPlugin>()

/** Register a plugin. Replace-by-alias; sorted by priority (higher first) on every read. */
export const registerConsentPlugin = (plugin: ConsentPlugin): void => {
  plugins.set(plugin.alias, plugin)
}

/** Every registered plugin, priority-sorted (higher first, ties keep insertion order). */
export const consentPlugins = (): ConsentPlugin[] =>
  [...plugins.values()].sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))

/**
 * Ask every registered plugin to decorate `url` with this document's decision, in priority order,
 * stopping at the first one that actually changes it. A plugin whose own rules refuse (a foreign
 * host, a `noreferrer` link, no local decision yet) returns `null` and is skipped, not an error.
 */
export const decorateConsentUrl = (
  url: string | URL, record: ConsentRecord | null, opts: ConsentOptions
): URL => {
  let result = url instanceof URL ? url : new URL(url)
  for (const plugin of consentPlugins()) {
    if (plugin.decorate == null) {
      continue
    }
    const decorated = plugin.decorate(result, record, opts)
    if (decorated != null) {
      result = decorated
    }
  }

  return result
}

/**
 * Every domain this document's decision is disclosed to, current host first, deduplicated — what a
 * dialog or a policy page lists. A plugin that runs on this host but names no domains of its own
 * (nothing registered, or `domains` not implemented) leaves the list at just the current host,
 * which is always correct to show even with no plugin at all.
 */
export const consentDomains = (opts: ConsentOptions): string[] => {
  const host = typeof location !== 'undefined' ? location.hostname : ''
  const named = consentPlugins().flatMap(plugin => plugin.domains?.(opts) ?? [])

  return [...new Set([host, ...named].filter(domain => domain !== ''))]
}

/** Try every registered plugin's `adopt`, in priority order, and use the first decision offered. */
export const adoptConsent = (opts: ConsentOptions): ConsentRecord | null => {
  for (const plugin of consentPlugins()) {
    const adopted = plugin.adopt?.(opts)
    if (adopted != null) {
      return adopted
    }
  }

  return null
}

/**
 * Try every registered plugin's `adoptLanguage`, in priority order, and use the first language
 * offered. The caller persists it (`writeConsentLanguage`, which refuses until `functional` is
 * granted) — and has to do that BEFORE its i18n
 * layer reads storage, which is why the inline `<head>` fragment (`consentLinkerScript`) is the
 * one that normally does.
 */
export const adoptConsentLanguage = (opts: ConsentOptions): string | null => {
  for (const plugin of consentPlugins()) {
    const adopted = plugin.adoptLanguage?.(opts)
    if (adopted != null) {
      return adopted
    }
  }

  return null
}

/** Run every registered plugin's `start`, in priority order. `consentStore.init` calls this once. */
export const startConsentPlugins = (opts: ConsentOptions): void => {
  for (const plugin of consentPlugins()) {
    plugin.start?.(opts)
  }
}
