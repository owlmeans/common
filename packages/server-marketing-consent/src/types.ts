import type { MarketingConsentEntrypoints, MarketingConsentDecision, MarketingConsentMode, MarketingConsentSource, TermsDocumentRef, MarketingConsentConfig, MarketingConsentDefinition, MarketingConsentStatusView, SaveMarketingConsentRequest, TermsAcceptance } from '@owlmeans/marketing-consent'
import type { ResourceRecord } from '@owlmeans/resource'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

import type { LazyService } from '@owlmeans/context'

export interface MarketingConsentHandlerOptions {
  serviceAlias?: string
  /** Let an OAuth-minted access token save decisions or record terms too. Defaults to `false` —
   * `status` is never token-refused regardless of this option. */
  allowAccessTokens?: boolean
}

/** The part of a `makeMarketingConsentProtocols` tree that carries a server implementation. */
export interface MarketingConsentServedProtocols extends Pick<MarketingConsentEntrypoints, 'status' | 'save' | 'terms'> {}

/**
 * One subject's saved decisions, one record per subject (`id` = `subjectKey(subject)`).
 *
 * `decisions` is an ARRAY, never an object keyed by consent key. A dotted key such as
 * `"marketing.email"` is read as a PATH by both Mongo dot-notation queries and Postgres jsonb path
 * operators — an object-keyed shape breaks the moment a second consent key is added. This is the
 * single most important shape decision in this package; the Mongo/Postgres extensions that will
 * store this record must not "flatten" it into an object for convenience.
 */
export interface MarketingConsentStateRecord extends ResourceRecord {
  id: string
  /** `subjectKey(subjectOf(req))` — see `./subject.js`. Also this record's own `id`. */
  subject: string
  userId: string
  profileId?: string
  entityId?: string
  decisions: MarketingConsentDecision[]
  terms?: {
    documents: TermsDocumentRef[]
    notices?: TermsDocumentRef[]
    version: string
    locale?: string
    acceptedAt: string
  }
  gpc?: boolean
  createdAt: string
  updatedAt: string
}

/**
 * Append-only evidence of every decision and terms acceptance ever recorded — GDPR Art. 7(1)
 * "demonstrate consent" material. Never updated or deleted, including on `purge()`: only the
 * current-state record is cleared there.
 */
export interface MarketingConsentLogRecord extends ResourceRecord {
  id: string
  subject: string
  userId: string
  profileId?: string
  entityId?: string
  kind: 'consent' | 'terms'
  /** Present when `kind === 'consent'`. */
  key?: string
  granted?: boolean
  revisedAt?: string
  mode?: MarketingConsentMode
  /** Present when `kind === 'terms'`. */
  documents?: TermsDocumentRef[]
  notices?: TermsDocumentRef[]
  version?: string
  decidedAt: string
  source: MarketingConsentSource
  locale?: string
  gpc?: boolean
}

export type MarketingConsentContext = ServerContext<ServerConfig>

/** Who a consent decision or a terms acceptance is recorded for. */
export interface MarketingConsentSubject {
  userId: string
  profileId?: string
  entityId?: string
}

export interface MarketingConsentObserver { (event: { subject: MarketingConsentSubject, decisions: MarketingConsentDecision[] }): void | Promise<void> }

export interface MarketingConsentService extends LazyService {
  /** The effective catalogue (`resolveMarketingConsents`), computed once and memoized. */
  definitions(): MarketingConsentDefinition[]
  status(subject: MarketingConsentSubject, opts?: { gpc?: boolean }): Promise<MarketingConsentStatusView>
  save(
    subject: MarketingConsentSubject,
    request: SaveMarketingConsentRequest | (Omit<SaveMarketingConsentRequest, 'source'> & { source: 'api' }),
  ): Promise<{ ok: true, status: MarketingConsentStatusView }>
  recordTerms(
    subject: MarketingConsentSubject, acceptance: TermsAcceptance, opts?: { source?: MarketingConsentSource },
  ): Promise<{ ok: true }>
  /**
   * The SERVER-SIDE gate a send/share checks — the SAVED, CONFIRMED answer only. An item still
   * `'new'` or `'revised'` has never been affirmatively answered by this person, so it reads as
   * NOT granted here even where `consentStatus`'s own `granted` defaults an opt-out item to `true`
   * for DISPLAY purposes.
   */
  isGranted(subject: MarketingConsentSubject, key: string, opts?: { gpc?: boolean }): Promise<boolean>
  /** Clears the current-state record. Log rows stay — they are the append-only compliance evidence. */
  purge(subject: MarketingConsentSubject): Promise<void>
  observe(listener: MarketingConsentObserver): void
}

export interface MakeMarketingConsentServiceOptions {
  alias?: string
  /** Resource alias holding one current-state record per subject. Defaults to `RES_MARKETING_CONSENT_STATE`. */
  state?: string
  /** Resource alias holding the append-only log. Defaults to `RES_MARKETING_CONSENT_LOG`. */
  log?: string
  config?: MarketingConsentConfig
}
