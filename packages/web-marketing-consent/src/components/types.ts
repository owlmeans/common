
import type { UseMarketingConsentModel, MarketingConsentTermsModel } from '../hooks/types.js'
import type { ReactNode } from 'react'

/** `(key, defaultValue) => string` — the package's own translator, or an app's. */
export interface Translate { (key: string, defaultValue: string): string }

export interface ConsentFieldsProps {
  t: Translate
  model: UseMarketingConsentModel
  /**
   * The sign-in screen's own translator (`auth` resource), which the Terms row speaks in. Given
   * only by the screen: the settings card has no Terms row and passes nothing.
   */
  termsT?: Translate
  locale?: string
}

export interface InlineLink {
  href: string
  label: string
}

export interface RowText {
  /** What the person agrees to. */
  statement: ReactNode
  /** The detail under it, when there is any. */
  detail: ReactNode | null
}

export interface MarketingConsentPreferencesProps {
  /** `(key, defaultValue) => string`, e.g. an app's own `useI18nApp` translator. Defaults to this
   * package's own bundle (`useI18nLib(MARKETING_CONSENT_I18N)`). */
  translate?: (key: string, defaultValue: string) => string
  className?: string
  onSaved?: () => void
}

export interface ConsentRowProps {
  /** The native checkbox. */
  checkbox: ReactNode
  /** What the person agrees to. */
  statement: ReactNode
  detail?: ReactNode
  /** Muted lines under the detail — a note, the last-updated date. */
  notes?: ReactNode
}

export interface MarketingConsentBodyProps {
  className?: string
}

export interface ConsentTermsProps {
  /** The sign-in screen's own translator (`auth` resource) — the Terms sentences are its. */
  termsT: Translate
  /** This package's own translator, for the "required" wording. */
  t: Translate
  model: MarketingConsentTermsModel
  locale?: string
}

export interface ConsentPrivacyNoticeProps {
  t: Translate
  model: Pick<MarketingConsentTermsModel, 'documents' | 'notices'>
  locale?: string
}
