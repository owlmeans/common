import { OWLMEANS_COOKIES_URL, OWLMEANS_PRIVACY_URL, OWLMEANS_TERMS_URL, type LoginTermsConfig } from '@owlmeans/config'
import { LOGIN_SERVICE, LOGIN_TERMS_STORAGE } from './consts.js'
import type { LoginContext, LoginService } from './types.js'
import type {
  LoginTermsAcceptance, LoginTermsHelper, ResolvedTerms, ResolvedTermsDocument, TermsSentencePart
} from './terms/types.js'
import './terms-config.js'
import { DEFAULT_LABEL } from './consts.local.js'

export const createLoginTermsHelper = (): LoginTermsHelper => {
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

  const resolveTerms = (cfg?: LoginTermsConfig | false): ResolvedTerms | null => {
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

  const termsAccepted = (resolved: ResolvedTerms | null): boolean => {
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

  const acceptTerms = (resolved: ResolvedTerms | null, accepted: boolean): void => {
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

  const termsLabelResolver = (
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

  const termsAcceptanceOf = (
    resolved: Pick<ResolvedTerms, 'documents' | 'notices' | 'version'>, locale?: string
  ): LoginTermsAcceptance => ({
    documents: resolved.documents.map(doc => ({ key: doc.key, href: doc.href, revisedAt: doc.revisedAt })),
    notices: resolved.notices.map(doc => ({ key: doc.key, href: doc.href, revisedAt: doc.revisedAt })),
    version: resolved.version,
    ...(locale != null ? { locale } : {}),
  })

  const termsDeferred = (ctx: LoginContext): boolean =>
    ctx.hasService(LOGIN_SERVICE)
    && ctx.service<LoginService>(LOGIN_SERVICE).steps()
      .some(step => step.confirmsTerms === true && ctx.hasEntrypoint(step.entrypoint))

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

  const termsSentence = (
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

  return {
    resolveTerms, termsAccepted, acceptTerms, termsLabelResolver, termsAcceptanceOf, termsDeferred, termsSentence,
  }
}

export const loginTermsHelper = createLoginTermsHelper()

/** @deprecated compat:factory-refactor — use `loginTermsHelper.resolveTerms(…)` */
export const resolveTerms = (cfg?: LoginTermsConfig | false): ResolvedTerms | null => loginTermsHelper.resolveTerms(cfg)

/** @deprecated compat:factory-refactor — use `loginTermsHelper.termsAccepted(…)` */
export const termsAccepted = (resolved: ResolvedTerms | null): boolean => loginTermsHelper.termsAccepted(resolved)

/** @deprecated compat:factory-refactor — use `loginTermsHelper.acceptTerms(…)` */
export const acceptTerms = (resolved: ResolvedTerms | null, accepted: boolean): void =>
  loginTermsHelper.acceptTerms(resolved, accepted)

/** @deprecated compat:factory-refactor — use `loginTermsHelper.termsLabelResolver(…)` */
export const termsLabelResolver = (
  translate: (key: string, defaultValue: string) => string, locale: string | undefined
): ((doc: ResolvedTermsDocument) => string) => loginTermsHelper.termsLabelResolver(translate, locale)

/** @deprecated compat:factory-refactor — use `loginTermsHelper.termsAcceptanceOf(…)` */
export const termsAcceptanceOf = (
  resolved: Pick<ResolvedTerms, 'documents' | 'notices' | 'version'>, locale?: string
): LoginTermsAcceptance => loginTermsHelper.termsAcceptanceOf(resolved, locale)

/** @deprecated compat:factory-refactor — use `loginTermsHelper.termsDeferred(…)` */
export const termsDeferred = (ctx: LoginContext): boolean => loginTermsHelper.termsDeferred(ctx)

/** @deprecated compat:factory-refactor — use `loginTermsHelper.termsSentence(…)` */
export const termsSentence = (
  template: string,
  resolved: Pick<ResolvedTerms, 'documents' | 'notices'>,
  locale: string | undefined,
  resolveLabel: (doc: ResolvedTermsDocument) => string
): TermsSentencePart[] => loginTermsHelper.termsSentence(template, resolved, locale, resolveLabel)
