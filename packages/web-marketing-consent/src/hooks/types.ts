import type { MarketingConsentStatusItem } from '@owlmeans/marketing-consent'
import type { ResolvedTermsDocument } from '@owlmeans/client-auth/login'
import type { MarketingConsentBulkSelection } from '../types.js'

export interface MarketingConsentGroup {
  key: string
  titleKey: string
  descriptionKey: string
  items: MarketingConsentStatusItem[]
}

/** The Terms confirmation, present only on the sign-in screen and only once `termsDeferred`. */
export interface MarketingConsentTermsModel {
  /** Still unconfirmed for the version this application currently configures. */
  needed: boolean
  ticked: boolean
  /** A blocked confirm was attempted — render the requirement sentence. */
  attempted: boolean
  tick: (value: boolean) => void
  /** What the checkbox agrees to — terms, then billing/product when configured, then custom. */
  documents: ResolvedTermsDocument[]
  /** What is merely disclosed, never consented to — privacy, plus cookies per its own rule. */
  notices: ResolvedTermsDocument[]
  /** The latest revision date among `documents`, only when the configuration asked to show it. */
  revisedAt?: string
  /** The digest acceptance is recorded against — changes whenever a document does. */
  version: string
}

export interface UseMarketingConsentModel {
  loading: boolean
  /**
   * The status could not be read at all (a network/auth failure), or the read has not answered
   * within the load budget. Distinct from `loading`: nobody is shown "Loading…" forever.
   */
  unreadable: boolean
  saving: boolean
  /** Non-null after a failed item `save()` — a fixed marker, not the wire text; the screen renders
   * one translated sentence (`screen.error`/`preferences.error`) regardless of its value. */
  error: string | null
  /** Non-null after a failed TERMS recording — distinct from `error`, which is the items' own. */
  termsError: string | null
  /** `navigator.globalPrivacyControl === true`, read once at mount. */
  gpc: boolean
  /** Grouped in the standard order (communications, data, trackers), any other group appended
   * after in first-seen order. Each item's `granted` reflects the CURRENT draft, not the value the
   * status call first loaded — a consumer never reads draft state separately. For `source:
   * 'sign-in'`, empty whenever nothing is currently pending — a step must not show items that need
   * no answer. For `source: 'settings'` (the default), this is the WHOLE catalogue, always — a
   * standing settings card lets a person revisit and change any decision, not only the ones
   * currently outstanding. */
  groups: MarketingConsentGroup[]
  bulkSelection: MarketingConsentBulkSelection
  allChecked: boolean
  allIndeterminate: boolean
  toggleAll: (checked: boolean) => void
  toggle: (key: string, checked: boolean) => void
  /**
   * False from the FIRST change the person makes this visit — a tick/untick of any item, or
   * ticking the Terms box. While true and only optional items are on screen, the confirm button is
   * still a valid, clickable action (saving exactly what is shown); it is styled muted and paired
   * with a hint rather than looking like an ordinary primary action.
   */
  pristine: boolean
  /** Only optional consents are on screen for this visit — no Terms box (`terms.needed` is
   * false) and at least one item is pending. Drives the muted-confirm/hint/Skip UI. */
  optionalOnly: boolean
  /**
   * This consumer registered the Terms confirmation on this screen (`appendMarketingConsent({
   * terms: 'step' })` + `termsDeferred`) — true even before the status load answers whether it is
   * CURRENTLY `terms.needed`, which is what a "Sign out" affordance shown while loading needs.
   */
  deferred: boolean
  terms: MarketingConsentTermsModel
  /**
   * Records the Terms acceptance first (only when `terms.needed`), then posts every LOADED item's
   * CURRENT draft value (never only the changed ones — the server upserts by key). For `source:
   * 'sign-in'` that is only the pending items, and is skipped entirely when none are; for `source:
   * 'settings'` it is the whole catalogue, so a save always reflects exactly what the card showed —
   * see `groups`. Resolves `true` only once everything due was recorded.
   */
  save: () => Promise<boolean>
  /**
   * Marks THIS sign-in as having skipped the step (so it is not asked again until the next one)
   * and clears `error`/`termsError` — the caller still has to move the flow on itself
   * (`useContinueLogin`). Never offered by a screen while `terms.needed` is true.
   */
  skip: () => Promise<void>
}

export interface UseMarketingConsentOptions {
  source?: 'sign-in' | 'settings'
  /** The UI's current language, sent with both Terms acceptance and optional-purpose decisions. */
  locale?: string
}
