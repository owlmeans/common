import type {
  ConsentCategory, ConsentGeoOptions, ConsentLinkerOptions, ConsentLocating, ConsentReason,
  ConsentRecord, ConsentService,
} from '@owlmeans/consent'

/**
 * How a first-time visitor is asked: `bar` — a tall bar across the bottom of a transparent overlay
 * that blocks the page but leaves it in sight, with "Cookie preferences", "Accept only mandatory" and
 * "Accept all" — or `window`, the preferences window straight away. Either way every later opening
 * (the bar's own "Cookie preferences", a footer link, the corner button, the sign-in gate) is the
 * window.
 */
export type ConsentDisplayMode = 'bar' | 'window'

export interface ConsentLink {
  href: string
  labelKey: string
  defaultLabel: string
}

export interface CookieConsentProps {
  locale?: string
  categories?: ConsentCategory[]
  /** `(key, defaultValue) => string`. Defaults to the built-in eight-language bundle. */
  translate?: (key: string, defaultValue: string) => string
  /** `bar` (the default, `CONSENT_DEFAULT_MODE`) or `window` — see `ConsentDisplayMode`. */
  mode?: ConsentDisplayMode
  /**
   * Ask only where the law requires it — see `ConsentGeoOptions`. Passed through to
   * `consentStore.init`: while the visitor is located the page waits behind a transparent overlay
   * and a spinner, and a visitor located outside the consent countries is never asked. Plain data,
   * so an Astro island can pass it; a locator plugin is registered in code instead.
   */
  geo?: ConsentGeoOptions
  /**
   * The cookie-policy page. A plain string, so an Astro route, a framework-resolved path and a raw
   * href all work — this component must not know how its host does routing.
   */
  policyHref?: string
  /** Anything else worth linking from the dialog: privacy, terms. */
  links?: ConsentLink[]
  storageKey?: string
  cookieDays?: number
  cookieDomain?: string
  silent?: boolean
  /** Hide the persistent re-open button, for an app that offers a footer link instead. */
  noReopenButton?: boolean
  /** Extra classes for the preferences window's card. */
  className?: string
  /** Extra classes for the bar. */
  barClassName?: string
  /** Cross-domain consent — see `ConsentLinkerOptions`. Passed through to `consentStore.init`. */
  linker?: ConsentLinkerOptions
}

export interface CookiePolicyProps {
  locale?: string
  translate?: (key: string, defaultValue: string) => string
  categories?: ConsentCategory[]
  /** Who operates this application — the branding record supplies it in a generated app. */
  operator?: string
  privacyHref?: string
  termsHref?: string
  storageKey?: string
  cookieDays?: number
  /**
   * The third-party services the site runs, each listed under the category that gates it —
   * name, provider, purpose, cookie names and the provider's privacy policy. A service whose
   * category is not among `categories` is listed in a trailing "Other services" group rather than
   * dropped. `@owlmeans/web-gtm`'s `googleTagServices(id)` supplies the entries for a Google tag.
   */
  services?: ConsentService[]
  className?: string
  /** Cross-domain consent — see `ConsentLinkerOptions`. Names the domains the policy discloses. */
  linker?: ConsentLinkerOptions
  /**
   * The geo gate in force (`CookieConsentProps.geo`). Set, the page explains that optional cookies
   * are asked about only where the law requires it and switched on by default elsewhere.
   */
  geo?: ConsentGeoOptions
}

export interface ConsentMenuWidgetProps {
  locale?: string
  /** `(key, defaultValue) => string`. Defaults to the built-in eight-language bundle. */
  translate?: (key: string, defaultValue: string) => string
  label?: string
  className?: string
  /** Defaults to `consentStore.open('reopen')` — the same call the floating button itself makes. */
  onSelect?: () => void
}

export interface UseConsentModel {
  record: ConsentRecord | null
  open: boolean
  reason: ConsentReason | null
  /** A country lookup is running — `first` keeps the page behind the spinner, `recheck` is silent. */
  locating: ConsentLocating | null
  granted: (key: string) => boolean
  save: (record: ConsentRecord) => void
  acceptAll: () => void
  openDialog: (reason?: ConsentReason) => void
  close: () => void
}
