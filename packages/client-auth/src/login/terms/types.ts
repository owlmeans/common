import type { LoginTermsConfig } from '@owlmeans/config'
import type { LoginContext } from '../types.js'

/** One document (or notice) a sign-in screen links to. */
export interface ResolvedTermsDocument {
  key: string
  href: string
  /** A caller's own label, already resolved to one string — only ever set for a custom document. */
  label?: string
  /** A locale map for the label, when the config supplied one — resolved by the renderer, not here. */
  labelMap?: Record<string, string>
  /** Translation key under `login.terms.*`, when this document has one. */
  i18nKey?: string
  revisedAt?: string
  /** Extra interpolation values for `i18nKey`'s translation (e.g. `{ product: 'Acme' }`). */
  params?: Record<string, string>
}

export interface ResolvedTerms {
  required: boolean
  terms: string
  privacy: string
  cookies?: string
  version: string
  /** What the checkbox agrees to — terms, then billing/product when configured, then custom. */
  documents: ResolvedTermsDocument[]
  /** What is merely DISCLOSED, never consented to — privacy, plus cookies per the rule below. */
  notices: ResolvedTermsDocument[]
  /** The latest `revisedAt` among {@link documents}. Only set when `showRevision` is true. */
  revisedAt?: string
  showRevision: boolean
}

/** One document as `@owlmeans/marketing-consent`'s `TermsDocumentRef` shape — structurally, with
 * no dependency on that package (client-auth is a layer below it). */
export interface TermsAcceptanceRef {
  key: string
  href: string
  revisedAt?: string
}

/** One fragment of an interpolated terms sentence — plain text, or a link to a document. */
export interface TermsSentencePart {
  text: string
  href?: string
  documentKey?: string
}

/** What a sign-in-time terms acceptance sends the server. */
export interface LoginTermsAcceptance {
  documents: TermsAcceptanceRef[]
  notices: TermsAcceptanceRef[]
  version: string
  locale?: string
}

/** The documents a sign-in agrees to: their resolution, the local acceptance record and the sentence. */
export interface LoginTermsHelper {
  /** The configured documents and notices, with the version acceptance is recorded against; null when terms are off. */
  resolveTerms: (cfg?: LoginTermsConfig | false) => ResolvedTerms | null
  /**
   * Whether this browser has already agreed to exactly these documents.
   *
   * `localStorage` and not a cookie: the record is a UI convenience, it never travels to a server,
   * and it must be readable by the surrogate login window — which is same-origin, so it sees the
   * opener's acceptance and does not ask twice. A preview iframe on a different origin gets its own
   * partition and therefore its own acceptance, which is correct rather than unfortunate.
   */
  termsAccepted: (resolved: ResolvedTerms | null) => boolean
  /** Record (or, with `accepted: false`, forget) this browser's agreement to these documents. */
  acceptTerms: (resolved: ResolvedTerms | null, accepted: boolean) => void
  /**
   * A document's own label: a caller's literal `label`, else its `labelMap` for the current locale,
   * else its `i18nKey` translated — each with `params` (e.g. `{ product: 'Acme' }`) interpolated
   * afterwards, since the `translate` contract every renderer shares is a plain
   * `(key, defaultValue) => string` with no interpolation option of its own.
   *
   * The one label resolver every renderer of a terms sentence uses — `FallbackLoginScreen` here, and
   * `@owlmeans/web-panel`'s `LoginTerms` — so the English fallbacks and the resolution order live in
   * exactly one place instead of two hand-kept copies.
   */
  termsLabelResolver: (
    translate: (key: string, defaultValue: string) => string, locale: string | undefined
  ) => (doc: ResolvedTermsDocument) => string
  /**
   * What a sign-in-time terms acceptance sends the server — structurally
   * `@owlmeans/marketing-consent`'s `TermsAcceptance`, so `client.recordTerms(termsAcceptanceOf(...))`
   * type-checks with no dependency in this direction. Shared by `termsRecorder` (the sign-in screen's
   * own local acceptance, copied at landing) and a Terms-mode consent screen recording the box it
   * just showed.
   */
  termsAcceptanceOf: (
    resolved: Pick<ResolvedTerms, 'documents' | 'notices' | 'version'>, locale?: string
  ) => LoginTermsAcceptance
  /**
   * Whether the Terms confirmation has been moved off the sign-in screen onto a registered step.
   *
   * True only when a step both DECLARES `confirmsTerms` and is BOUND (`ctx.hasEntrypoint`) — an app
   * that registers the step (e.g. `appendMarketingConsent({ terms: 'step' })`) but never binds its
   * screen (an older target, a partial import) keeps the sign-in checkbox, fail-closed: a person must
   * never find the confirmation missing from both places at once.
   *
   * Reads the service directly (`ctx.hasService`), never `ensureLoginService` — that registers an
   * empty host as a side effect, which a render-time check must not do.
   */
  termsDeferred: (ctx: LoginContext) => boolean
  /**
   * Interpolate a translated sentence template around its document list(s).
   *
   * Supports `{{documents}}` (→ `resolved.documents`) and `{{notices}}` (→ `resolved.notices`), and
   * — for backward compatibility with an older template string — the legacy `{{terms}}`, `{{privacy}}`
   * and `{{cookies}}` placeholders, each resolved to its one matching document. Framework-agnostic on
   * purpose: it returns plain data, never JSX, so both `@owlmeans/web-panel` and the plain fallback
   * screen can turn the parts into their own markup.
   */
  termsSentence: (
    template: string,
    resolved: Pick<ResolvedTerms, 'documents' | 'notices'>,
    locale: string | undefined,
    resolveLabel: (doc: ResolvedTermsDocument) => string
  ) => TermsSentencePart[]
}
