import type {
  ConsentCategory, ConsentLinkerOptions, ConsentReason, ConsentRecord, ConsentService,
} from '@owlmeans/consent'

export interface ConsentLink {
  href: string
  labelKey: string
  defaultLabel: string
}

export interface CookieConsentProps {
  locale?: string
  categories?: ConsentCategory[]
  /** `(key, defaultValue) => string`. Defaults to the built-in seven-language bundle. */
  translate?: (key: string, defaultValue: string) => string
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
  className?: string
  /** Cross-domain consent — see `ConsentLinkerOptions`. Passed through to `consentStore.init`. */
  linker?: ConsentLinkerOptions
  /**
   * The `localStorage` keys this application keeps its functional preferences under — removed
   * whenever the visitor has not granted `functional`. Passed through to `consentStore.init`;
   * defaults to the interface-language key. See `ConsentOptions.functionalKeys`.
   */
  functionalKeys?: string[]
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
}

export interface ConsentMenuWidgetProps {
  locale?: string
  /** `(key, defaultValue) => string`. Defaults to the built-in seven-language bundle. */
  translate?: (key: string, defaultValue: string) => string
  label?: string
  className?: string
  /** Defaults to `openConsent('reopen')` — the same call the floating button itself makes. */
  onSelect?: () => void
}

export interface UseConsentModel {
  record: ConsentRecord | null
  open: boolean
  reason: ConsentReason | null
  granted: (key: string) => boolean
  save: (record: ConsentRecord) => void
  acceptAll: () => void
  openDialog: (reason?: ConsentReason) => void
  close: () => void
}
