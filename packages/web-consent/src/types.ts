import type {
  ConsentCategory, ConsentReason, ConsentRecord,
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
  className?: string
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
