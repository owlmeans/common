/**
 * Google Consent Mode v2 signals.
 *
 * Named here rather than left as free strings because a typo in a signal name is silent: the tag
 * manager simply never sees the update, and the only symptom is analytics that stay switched off
 * for everyone who agreed to them.
 */
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
  /** Resolved through `translate`; the built-in bundle supplies the default set in 7 languages. */
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

/** `v` is the schema version; every other key is a category key. */
export interface ConsentRecord {
  v?: number
  [category: string]: boolean | number | undefined
}

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
}

/** Why the dialog is open. `login` is what the sign-in precondition raises. */
export type ConsentReason = 'initial' | 'reopen' | 'login' | string

export interface ConsentState {
  record: ConsentRecord | null
  open: boolean
  reason: ConsentReason | null
}

export type ConsentListener = (state: ConsentState) => void

export interface ConsentStore {
  get: () => ConsentState
  subscribe: (listener: ConsentListener) => () => void
  /** Push the defaults, load and migrate any stored record, apply it, and open when there is none. */
  init: (opts?: ConsentOptions) => void
  save: (record: ConsentRecord) => void
  acceptAll: () => void
  open: (reason?: ConsentReason) => void
  close: () => void
  /** Imperative reader, for the callers that are not React. */
  granted: (key: string) => boolean
  options: () => ConsentOptions & { categories: ConsentCategory[], storageKey: string }
}
