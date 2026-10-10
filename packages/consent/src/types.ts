/**
 * Google Consent Mode v2 signals.
 *
 * Named here rather than left as free strings because a typo in a signal name is silent: the tag
 * manager simply never sees the update, and the only symptom is analytics that stay switched off
 * for everyone who agreed to them.
 */
import { CONSENT_LINK_VERSION } from './consts.local.js'

export type ConsentSignal =
  | 'ad_storage' | 'ad_user_data' | 'ad_personalization'
  | 'analytics_storage' | 'functionality_storage'
  | 'personalization_storage' | 'security_storage'

export interface ConsentCategory {
  /** Stable storage key. `essential` is reserved and always required. */
  key: string
  /**
   * Always granted, rendered locked and labelled as required.
   *
   * Strictly-necessary storage does not need consent, and a dialog that presents it as a choice is
   * itself a dark pattern. A required category is disclosure, not a question.
   */
  required?: boolean
  /** Resolved through `translate`; the built-in bundle supplies the default set in 8 languages. */
  labelKey: string
  descriptionKey: string
  /**
   * The window global this category yields to: `window[globalVar] = granted`, written on every
   * apply and BEFORE the tag-manager push.
   *
   * This is the seam for anything that cannot subscribe — a custom-HTML tag reading a flag, a
   * hand-placed pixel, a script that only ever runs once. Without it, integrating a tag that is
   * not Consent-Mode-aware means reaching into this package.
   */
  globalVar?: string
  /** Consent Mode v2 signals this category drives. */
  signals?: ConsentSignal[]
  /** dataLayer event pushed when this category transitions from denied to granted. */
  event?: string
}

/**
 * One third-party service the site runs under a consent category, as the cookie policy discloses
 * it.
 *
 * A category says WHY something is stored; a service says WHO receives it. A regulator reading
 * the policy wants the second — "analytics cookies" discloses nothing about which company learns
 * what a visitor did — so a site that runs a tag lists it here, beside the category that gates
 * it. Plain data rather than keys: the name, the provider and the purpose are whatever the party
 * adding the tag knows about it, and `@owlmeans/web-gtm`'s `googleTagServices(id)` is the
 * disclosure for a Google tag.
 */
export interface ConsentService {
  /** Display name: "Google Analytics". */
  name: string
  /** Who receives the data: "Google LLC". */
  provider: string
  /**
   * The `ConsentCategory.key` this service runs under: `'analytics'`, `'marketing'`,
   * `'essential'`, or a custom key. A service whose category is not in force is still disclosed,
   * in a trailing group of its own — hiding it would hide something that may still run.
   */
  category: string
  /** One sentence on what it does with the data. */
  purpose?: string
  /** Cookie names it may set: `['_ga', '_ga_<ID>']`. */
  cookies?: string[]
  /** The provider's own privacy policy. */
  privacyHref?: string
}

/**
 * `v` is the schema version and `auto` marks an automatic decision; every other key is a category
 * key — so neither `v` nor `auto` may ever name a category.
 */
export interface ConsentRecord {
  v?: number
  /**
   * Unix seconds at which this record was DERIVED rather than chosen: the visitor was located
   * outside every consent-requiring country (`ConsentGeoOptions`) and nobody asked them. Present
   * only on an automatic decision — an explicit save drops it. An automatic decision is trusted for
   * `CONSENT_AUTO_MAX_AGE` seconds and then counts as undecided until the visitor is located again,
   * so a traveller who crosses into a consent country is asked there instead of carrying a grant
   * nobody gave. It never travels on a linker link as the visitor's own choice.
   */
  auto?: number
  [category: string]: boolean | number | undefined
}

/** Where a locator places the visitor. */
export interface ConsentGeoLocation {
  /** ISO 3166-1 alpha-2, upper case — `PL`, `US`. Anything else counts as "not located". */
  country: string
}

export interface ConsentCloudflareOptions {
  /** The same-origin path of Cloudflare's trace endpoint. Defaults to `CONSENT_TRACE_PATH`. */
  path?: string
}

/**
 * Ask only where the law requires it: locate the visitor first, and decide automatically wherever
 * no consent is required.
 *
 * Its presence turns the gate on. The country comes from the registered locators
 * (`ConsentGeoPlugin`, highest priority first, the first usable answer wins); `cloudflare` adds the
 * built-in one. A visitor nobody can locate — no locator, every one of them failing, an unusable
 * code, `timeout` passing — is asked, exactly as without the gate.
 */
export interface ConsentGeoOptions {
  /**
   * The built-in locator: a same-origin GET of Cloudflare's `/cdn-cgi/trace`, reading `loc=`. It
   * answers only where the host is proxied by Cloudflare — anywhere else (a local dev server, a
   * self-hosted export) it fails, and the visitor is asked.
   */
  cloudflare?: boolean | ConsentCloudflareOptions
  /** The countries where consent is asked. Defaults to `CONSENT_REQUIRED_COUNTRIES`. */
  countries?: readonly string[]
  /** How long locating may take before the visitor is asked anyway, in ms. `CONSENT_GEO_TIMEOUT`. */
  timeout?: number
}

/** Which lookup is running: the first one (the page waits behind a spinner) or a silent re-check. */
export type ConsentLocating = 'first' | 'recheck'

export interface ConsentOptions {
  categories?: ConsentCategory[]
  storageKey?: string
  cookieDays?: number
  /**
   * Left undefined by default, and that is deliberate: setting a domain orphans the existing
   * host-only cookie, so every visitor who has already chosen would be asked again.
   */
  cookieDomain?: string
  /** Skip every dataLayer and global write. For tests, and for an app that runs no tags. */
  silent?: boolean
  /**
   * Cross-domain consent: share this decision, and adopt one, between the listed first-party
   * domains — a visitor who already decided on one need not decide again on another. See
   * `consentLinker`/`ConsentPlugin` in `./plugins.js` and `./linker.js`.
   */
  linker?: ConsentLinkerOptions
  /** Ask only in consent-requiring countries — see `ConsentGeoOptions`. Off when absent. */
  geo?: ConsentGeoOptions
}

export interface ConsentLinkerOptions {
  /**
   * Every domain this decision is shared with, the current host included or not — either way, the
   * current host is always part of the disclosed list (`consentDomains`), since a visitor reads
   * "applies to" as the whole set, not just the others.
   */
  domains: string[]
  /** The URL parameter a decorated link carries the decision in. Defaults to `owlcc`. */
  param?: string
  /** How old a decorated link's timestamp may be and still be trusted, in seconds. Defaults to 300. */
  maxAge?: number
  /**
   * Carry the visitor's interface language along with the decision, so a visitor reading the site
   * in Polish arrives on the next domain in Polish. Its PRESENCE turns the sending side on (a link
   * to a listed domain carries this document's `<html lang>`); `supported` turns the receiving side
   * on — which stores the carried language whatever the cookie decision says, because the interface
   * language is strictly necessary. See `ConsentLinkerLanguage`.
   */
  language?: ConsentLinkerLanguage
}

export interface ConsentLinkerLanguage {
  /**
   * RECEIVING side: the languages this application can render. A carried language is adopted only
   * when it is one of these, exactly or by its base tag (`de-DE` → `de`), and is then stored at
   * once — the interface language is strictly necessary storage, so no cookie decision gates it;
   * anything else is ignored and the application keeps choosing its own. Leave it out on a site
   * that only SENDS its language.
   */
  supported?: string[]
  /**
   * RECEIVING side: the `localStorage` key an explicit language choice lives under. Defaults to
   * `owlmeans-lng`, the key `@owlmeans/client-i18n` reads before it renders anything.
   */
  storageKey?: string
}

/**
 * Why the consent UI is open. `initial` is the first ask (the bar, in bar mode); `preferences` is the
 * bar's own "Cookie preferences"; `reopen` a footer link or the corner button; `login` what the
 * sign-in precondition raises. Every reason but `initial` opens the preferences window.
 */
export type ConsentReason = 'initial' | 'reopen' | 'login' | 'preferences' | string

export interface ConsentState {
  record: ConsentRecord | null
  open: boolean
  reason: ConsentReason | null
  /** A country lookup is running (`ConsentGeoOptions`); `null` once it settled, or when there is none. */
  locating: ConsentLocating | null
}

export interface ConsentListener { (state: ConsentState): void }

export interface ConsentStore {
  get: () => ConsentState
  subscribe: (listener: ConsentListener) => () => void
  /**
   * Push the defaults, load and migrate any stored record, apply it — and, when there is none,
   * either ask at once or, with `geo` set, locate the visitor first and ask or decide automatically.
   * Synchronous: a lookup runs in the background, `locating` says so, and `settled()` waits for it.
   */
  init: (opts?: ConsentOptions) => void
  /** Record an explicit decision. Always explicit: an `auto` key on `record` is dropped. */
  save: (record: ConsentRecord) => void
  acceptAll: () => void
  /** Open the consent UI from anywhere — a footer link, a policy page, a login gate. */
  open: (reason?: ConsentReason) => void
  close: () => void
  /** Imperative reader, for the callers that are not React. */
  granted: (key: string) => boolean
  options: () => ConsentOptions & { categories: ConsentCategory[], storageKey: string }
  /** The state once no country lookup is running — at once when none is. */
  settled: () => Promise<ConsentState>
}

/** A language the dialog's built-in copy is carried in (`CONSENT_LOCALES`). */
export type ConsentLocale = 'en' | 'pl' | 'ru' | 'be' | 'uk' | 'es' | 'de' | 'fr'

/** The decoded, not-yet-validated payload a decorated link's parameter carries. */
export interface ConsentLinkPayload {
  v: typeof CONSENT_LINK_VERSION
  /** One entry per OPTIONAL category this site knows, `1` granted / `0` denied. */
  c: Record<string, 0 | 1>
  /** Unix seconds the link was decorated at. */
  t: number
  /**
   * The interface language of the page the link was on (a BCP 47 tag, lower-cased) — present only
   * when the sender has `linker.language` set and its `<html lang>` names one. Optional on the
   * wire, so a receiver that predates it reads the same `v: 2` payload and ignores the field.
   */
  l?: string
}

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
   * choosing its own. Only a CANDIDATE: it says what the link carried, and `writeConsentLanguage`
   * stores it — unconditionally, since the interface language is strictly necessary storage.
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
  /**
   * Find the visitor's country, or throw when it cannot tell. Asked only while `opts.geo` is set
   * and nothing is stored; locators run highest priority first and the first usable country wins,
   * so a throw (or an unusable code) hands over to the next one — the built-in Cloudflare locator
   * sits at the very bottom.
   */
  locate?: (opts: ConsentOptions) => Promise<ConsentGeoLocation>
}

/**
 * The country-detection plugin: one async method that resolves the visitor's country or throws.
 * Register it with `consentPluginHelper.registerConsentPlugin` — or, in an OwlMeans application,
 * with `@owlmeans/web-panel/consent`'s `appendConsentGeoPlugin(context, plugin)` while the context is
 * configured.
 */
export interface ConsentGeoPlugin extends ConsentPlugin {
  locate: (opts: ConsentOptions) => Promise<ConsentGeoLocation>
}
