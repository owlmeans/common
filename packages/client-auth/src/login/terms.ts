import { OWLMEANS_COOKIES_URL, OWLMEANS_PRIVACY_URL, OWLMEANS_TERMS_URL } from '@owlmeans/config'
import type { LoginTermsConfig } from '@owlmeans/config'
import { LOGIN_SERVICE, LOGIN_TERMS_STORAGE } from './consts.js'
import type { LoginContext, LoginService } from './types.js'
import './terms-config.js'

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

/**
 * A stable identity for one set of documents.
 *
 * Acceptance is recorded against it, so changing a URL — or a revision date, or adding a document
 * — re-asks. Cheap and order-independent rather than cryptographic; it only has to change when the
 * content pointer does.
 *
 * With no billing/product/custom documents and no revisions configured, this MUST produce the same
 * digest as before this file grew those fields: `digest([terms, privacy, cookies])`. `terms.spec.ts`
 * pins that byte-identity so no existing user is silently asked to re-accept.
 */
const digest = (parts: string[]): string => {
  let hash = 0
  for (const char of parts.join(' ')) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  }

  return (hash >>> 0).toString(36)
}

const withRevisedAt = (
  doc: Omit<ResolvedTermsDocument, 'revisedAt'>, revisedAt: string | undefined
): ResolvedTermsDocument => revisedAt != null ? { ...doc, revisedAt } : doc

export const resolveTerms = (cfg?: LoginTermsConfig | false): ResolvedTerms | null => {
  if (cfg === false) {
    return null
  }
  const terms = cfg?.terms ?? OWLMEANS_TERMS_URL
  const privacy = cfg?.privacy ?? OWLMEANS_PRIVACY_URL
  const cookies = cfg?.cookies ?? OWLMEANS_COOKIES_URL

  const documents: ResolvedTermsDocument[] = [
    withRevisedAt(
      { key: 'terms', href: terms, i18nKey: 'login.terms.terms' }, cfg?.revisions?.terms
    ),
  ]

  if (cfg?.billing) {
    const billing = typeof cfg.billing === 'string' ? { href: cfg.billing } : cfg.billing
    documents.push(withRevisedAt(
      { key: 'billing', href: billing.href, i18nKey: 'login.terms.billing' },
      cfg?.revisions?.billing ?? billing.revisedAt
    ))
  }

  if (cfg?.product) {
    documents.push(withRevisedAt(
      {
        key: 'product', href: cfg.product.href, i18nKey: 'login.terms.product',
        params: { product: cfg.product.name },
      },
      cfg.product.revisedAt ?? cfg?.revisions?.product
    ))
  }

  for (const custom of cfg?.documents ?? []) {
    documents.push(withRevisedAt(
      {
        key: custom.key, href: custom.href,
        ...(typeof custom.label === 'string' ? { label: custom.label } : {}),
        ...(custom.label != null && typeof custom.label !== 'string' ? { labelMap: custom.label } : {}),
        ...(custom.i18nKey != null ? { i18nKey: custom.i18nKey } : {}),
      },
      custom.revisedAt ?? cfg?.revisions?.[custom.key]
    ))
  }

  // Cookies is disclosed as ITS OWN notice only when the app named a cookie policy explicitly, or
  // when terms/privacy/cookies are ALL still the OwlMeans defaults — never as a silent extra on an
  // app that customized terms and privacy but left cookies unset.
  const allDefault = terms === OWLMEANS_TERMS_URL && privacy === OWLMEANS_PRIVACY_URL
    && cookies === OWLMEANS_COOKIES_URL
  const includeCookies = cfg?.cookies != null || allDefault

  const notices: ResolvedTermsDocument[] = [
    withRevisedAt({ key: 'privacy', href: privacy, i18nKey: 'login.terms.privacy' }, cfg?.revisions?.privacy),
    ...(includeCookies
      ? [withRevisedAt({ key: 'cookies', href: cookies, i18nKey: 'login.terms.cookies' }, cfg?.revisions?.cookies)]
      : []),
  ]

  // The digest input for a plain config (no billing/product/custom/revisions) is BYTE-IDENTICAL to
  // the pre-existing `[terms, privacy, cookies]` — see `terms.spec.ts`.
  const digestInput = [terms, privacy, cookies]
  for (const doc of documents) {
    if (doc.key !== 'terms') {
      digestInput.push(`${doc.key}=${doc.href}`)
    }
  }
  for (const doc of [...documents, ...notices]) {
    if (doc.revisedAt != null) {
      digestInput.push(`${doc.key}@${doc.revisedAt}`)
    }
  }

  const showRevision = cfg?.showRevision === true
  const revisedAtValues = documents
    .map(doc => doc.revisedAt)
    .filter((value): value is string => value != null)
  const revisedAt = showRevision && revisedAtValues.length > 0
    ? revisedAtValues.reduce((max, value) => value > max ? value : max)
    : undefined

  return {
    required: cfg?.required ?? true,
    terms, privacy, cookies,
    version: cfg?.version ?? digest(digestInput),
    documents, notices, showRevision,
    ...(revisedAt != null ? { revisedAt } : {}),
  }
}

/**
 * Whether this browser has already agreed to exactly these documents.
 *
 * `localStorage` and not a cookie: the record is a UI convenience, it never travels to a server,
 * and it must be readable by the surrogate login window — which is same-origin, so it sees the
 * opener's acceptance and does not ask twice. A preview iframe on a different origin gets its own
 * partition and therefore its own acceptance, which is correct rather than unfortunate.
 */
export const termsAccepted = (resolved: ResolvedTerms | null): boolean => {
  if (resolved == null || !resolved.required) {
    return true
  }
  try {
    return window.localStorage.getItem(LOGIN_TERMS_STORAGE) === resolved.version
  } catch {
    // Storage can be unavailable (private modes, blocked cookies). Refusing to remember is not
    // refusing to proceed: the user is asked again, every time, which is the safe direction.
    return false
  }
}

export const acceptTerms = (resolved: ResolvedTerms | null, accepted: boolean): void => {
  if (resolved == null) {
    return
  }
  try {
    if (accepted) {
      window.localStorage.setItem(LOGIN_TERMS_STORAGE, resolved.version)
    } else {
      window.localStorage.removeItem(LOGIN_TERMS_STORAGE)
    }
  } catch { /* nothing to remember if storage was never available */ }
}

/** The same English fallback a document's `i18nKey` translates to when nothing else names it. */
const DEFAULT_LABEL: Record<string, string> = {
  terms: 'Terms & Conditions',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Policy',
  billing: 'Billing Terms',
  product: '{{product}} Product Terms',
}

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
export const termsLabelResolver = (
  translate: (key: string, defaultValue: string) => string, locale: string | undefined
) => (doc: ResolvedTermsDocument): string => {
  const fromMap = doc.labelMap != null
    ? (locale != null ? doc.labelMap[locale] : undefined) ?? Object.values(doc.labelMap)[0]
    : undefined
  let label = doc.label ?? fromMap
    ?? (doc.i18nKey != null ? translate(doc.i18nKey, DEFAULT_LABEL[doc.key] ?? doc.key) : doc.key)

  if (doc.params != null) {
    for (const [key, value] of Object.entries(doc.params)) {
      label = label.split(`{{${key}}}`).join(value)
    }
  }

  return label
}

/** One document as `@owlmeans/marketing-consent`'s `TermsDocumentRef` shape — structurally, with
 * no dependency on that package (client-auth is a layer below it). */
export interface TermsAcceptanceRef {
  key: string
  href: string
  revisedAt?: string
}

/**
 * What a sign-in-time terms acceptance sends the server — structurally
 * `@owlmeans/marketing-consent`'s `TermsAcceptance`, so `client.recordTerms(termsAcceptanceOf(...))`
 * type-checks with no dependency in this direction. Shared by `termsRecorder` (the sign-in screen's
 * own local acceptance, copied at landing) and a Terms-mode consent screen recording the box it
 * just showed.
 */
export const termsAcceptanceOf = (
  resolved: Pick<ResolvedTerms, 'documents' | 'notices' | 'version'>, locale?: string
): { documents: TermsAcceptanceRef[], notices: TermsAcceptanceRef[], version: string, locale?: string } => ({
  documents: resolved.documents.map(doc => ({ key: doc.key, href: doc.href, revisedAt: doc.revisedAt })),
  notices: resolved.notices.map(doc => ({ key: doc.key, href: doc.href, revisedAt: doc.revisedAt })),
  version: resolved.version,
  ...(locale != null ? { locale } : {}),
})

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
export const termsDeferred = (ctx: LoginContext): boolean =>
  ctx.hasService(LOGIN_SERVICE)
  && ctx.service<LoginService>(LOGIN_SERVICE).steps()
    .some(step => step.confirmsTerms === true && ctx.hasEntrypoint(step.entrypoint))

/** One fragment of an interpolated terms sentence — plain text, or a link to a document. */
export interface TermsSentencePart {
  text: string
  href?: string
  documentKey?: string
}

/**
 * Format a list of documents into sentence parts, via `Intl.ListFormat` when it exists ("A, B and
 * C" in the caller's own locale and conjunction word), falling back to a plain ", "/" and " join
 * when it does not (an old runtime with no `Intl.ListFormat`).
 */
const formatDocumentList = (
  docs: ResolvedTermsDocument[], locale: string | undefined, resolveLabel: (doc: ResolvedTermsDocument) => string
): TermsSentencePart[] => {
  if (docs.length < 1) {
    return []
  }
  const labels = docs.map(resolveLabel)

  if (typeof Intl !== 'undefined' && typeof Intl.ListFormat === 'function') {
    let cursor = 0
    const formatter = new Intl.ListFormat(locale, { style: 'long', type: 'conjunction' })

    return formatter.formatToParts(labels).map(part => {
      if (part.type === 'element') {
        const doc = docs[cursor++]

        return { text: part.value, href: doc.href, documentKey: doc.key }
      }

      return { text: part.value }
    })
  }

  const parts: TermsSentencePart[] = []
  docs.forEach((doc, index) => {
    if (index > 0) {
      parts.push({ text: index === docs.length - 1 ? ' and ' : ', ' })
    }
    parts.push({ text: labels[index], href: doc.href, documentKey: doc.key })
  })

  return parts
}

/**
 * Interpolate a translated sentence template around its document list(s).
 *
 * Supports `{{documents}}` (→ `resolved.documents`) and `{{notices}}` (→ `resolved.notices`), and
 * — for backward compatibility with an older template string — the legacy `{{terms}}`, `{{privacy}}`
 * and `{{cookies}}` placeholders, each resolved to its one matching document. Framework-agnostic on
 * purpose: it returns plain data, never JSX, so both `@owlmeans/web-panel` and the plain fallback
 * screen can turn the parts into their own markup.
 */
export const termsSentence = (
  template: string,
  resolved: Pick<ResolvedTerms, 'documents' | 'notices'>,
  locale: string | undefined,
  resolveLabel: (doc: ResolvedTermsDocument) => string
): TermsSentencePart[] => {
  const byKey = (key: string): ResolvedTermsDocument | undefined =>
    resolved.documents.find(doc => doc.key === key) ?? resolved.notices.find(doc => doc.key === key)

  const placeholder = /\{\{(documents|notices|terms|privacy|cookies)\}\}/g
  const parts: TermsSentencePart[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = placeholder.exec(template)) != null) {
    if (match.index > lastIndex) {
      parts.push({ text: template.slice(lastIndex, match.index) })
    }

    const token = match[1]
    if (token === 'documents') {
      parts.push(...formatDocumentList(resolved.documents, locale, resolveLabel))
    } else if (token === 'notices') {
      parts.push(...formatDocumentList(resolved.notices, locale, resolveLabel))
    } else {
      const doc = byKey(token)
      if (doc != null) {
        parts.push({ text: resolveLabel(doc), href: doc.href, documentKey: doc.key })
      }
    }

    lastIndex = placeholder.lastIndex
  }
  if (lastIndex < template.length) {
    parts.push({ text: template.slice(lastIndex) })
  }

  return parts
}
