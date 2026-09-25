import { describe, expect, test } from 'bun:test'
import { OWLMEANS_COOKIES_URL, OWLMEANS_PRIVACY_URL, OWLMEANS_TERMS_URL } from '@owlmeans/config'
import type { LoginTermsConfig } from '@owlmeans/config'
import { resolveTerms, termsAcceptanceOf, termsLabelResolver, termsSentence } from '../src/login/terms.js'
import type { ResolvedTermsDocument } from '../src/login/terms.js'

/**
 * The pre-existing digest, copied rather than imported: `resolveTerms`'s own `digest` is private,
 * and re-deriving it here is the whole point — this pins what the ALGORITHM produced before this
 * file grew billing/product/custom documents, so a change to either one is caught independently.
 */
const legacyDigest = (parts: string[]): string => {
  let hash = 0
  for (const char of parts.join(' ')) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0
  }

  return (hash >>> 0).toString(36)
}

const DEFAULT_LABEL: Record<string, string> = {
  terms: 'Terms & Conditions', privacy: 'Privacy Policy', cookies: 'Cookie Policy',
  billing: 'Billing Terms', product: '{{product}} Product Terms',
}

/** A minimal stand-in for a renderer's own `resolveLabel` — no i18n context, just the fallback. */
const label = (doc: ResolvedTermsDocument): string => {
  let text = doc.label ?? DEFAULT_LABEL[doc.key] ?? doc.i18nKey ?? doc.key
  if (doc.params != null) {
    for (const [key, value] of Object.entries(doc.params)) {
      text = text.split(`{{${key}}}`).join(value)
    }
  }

  return text
}

describe('resolveTerms — the digest', () => {
  test('is byte-identical to the pre-existing algorithm when nothing new is configured', () => {
    const cfg: LoginTermsConfig = {
      required: true, terms: 'https://a.test/terms', privacy: 'https://a.test/privacy',
    }
    const resolved = resolveTerms(cfg)

    expect(resolved?.version).toBe(
      legacyDigest(['https://a.test/terms', 'https://a.test/privacy', OWLMEANS_COOKIES_URL])
    )
  })

  test('a defaulted config (no terms/privacy/cookies at all) matches the same algorithm', () => {
    const resolved = resolveTerms({})

    expect(resolved?.version).toBe(
      legacyDigest([OWLMEANS_TERMS_URL, OWLMEANS_PRIVACY_URL, OWLMEANS_COOKIES_URL])
    )
  })

  test('an explicit version override is used verbatim, as before', () => {
    expect(resolveTerms({ version: 'pinned-v3' })?.version).toBe('pinned-v3')
  })

  test('adding a billing document changes the digest', () => {
    const base = resolveTerms({})?.version
    const withBilling = resolveTerms({ billing: 'https://a.test/billing' })?.version

    expect(withBilling).not.toBe(base)
  })

  test('changing only a revision date changes the digest', () => {
    const unrevised = resolveTerms({})?.version
    const revised = resolveTerms({ revisions: { terms: '2026-01-01' } })?.version

    expect(revised).not.toBe(unrevised)
  })
})

describe('resolveTerms — documents and notices', () => {
  test('billing/product/documents/revisions all populate `documents`, in order', () => {
    // Module-augmentation proof: this whole literal type-checks against `LoginTermsConfig` only
    // because `@owlmeans/client-auth/login`'s augmentation merged onto it — a file that imports
    // NOTHING from this package would fail to compile the `billing`/`product`/`documents`/
    // `revisions`/`showRevision` fields below.
    const cfg: LoginTermsConfig = {
      terms: 'https://a.test/terms',
      billing: { href: 'https://a.test/billing', revisedAt: '2026-02-01' },
      product: { name: 'Acme', href: 'https://a.test/product' },
      documents: [
        { key: 'custom-a', href: 'https://a.test/custom-a', label: 'Custom A' },
        { key: 'custom-b', href: 'https://a.test/custom-b', i18nKey: 'login.terms.custom-b' },
      ],
      revisions: { terms: '2026-01-15' },
    }

    const resolved = resolveTerms(cfg)

    expect(resolved?.documents.map(doc => doc.key))
      .toEqual(['terms', 'billing', 'product', 'custom-a', 'custom-b'])
    expect(resolved?.documents[0].revisedAt).toBe('2026-01-15')
    expect(resolved?.documents[1].href).toBe('https://a.test/billing')
    expect(resolved?.documents[1].revisedAt).toBe('2026-02-01')
    expect(resolved?.documents[2].href).toBe('https://a.test/product')
    expect(resolved?.documents[2].params).toEqual({ product: 'Acme' })
    expect(resolved?.documents[3]).toMatchObject({ key: 'custom-a', href: 'https://a.test/custom-a', label: 'Custom A' })
    expect(resolved?.documents[4]).toMatchObject({ key: 'custom-b', href: 'https://a.test/custom-b', i18nKey: 'login.terms.custom-b' })
  })

  test('a bare billing string is treated as `{ href }`', () => {
    const resolved = resolveTerms({ billing: 'https://a.test/billing' })

    expect(resolved?.documents.find(doc => doc.key === 'billing')?.href).toBe('https://a.test/billing')
  })

  test('`false` turns billing/product off — the default', () => {
    const resolved = resolveTerms({ billing: false, product: false })

    expect(resolved?.documents.map(doc => doc.key)).toEqual(['terms'])
  })

  test('the cookies notice is included when explicitly configured', () => {
    const resolved = resolveTerms({
      terms: 'https://a.test/terms', privacy: 'https://a.test/privacy', cookies: 'https://a.test/cookies',
    })

    expect(resolved?.notices.map(doc => doc.key)).toEqual(['privacy', 'cookies'])
  })

  test('the cookies notice is included when terms/privacy/cookies are ALL still the defaults', () => {
    const resolved = resolveTerms({})

    expect(resolved?.notices.map(doc => doc.key)).toEqual(['privacy', 'cookies'])
  })

  test('the cookies notice is DROPPED when terms/privacy were customised but cookies was not', () => {
    const resolved = resolveTerms({ terms: 'https://a.test/terms', privacy: 'https://a.test/privacy' })

    expect(resolved?.notices.map(doc => doc.key)).toEqual(['privacy'])
  })

  test('`revisedAt` is set only when `showRevision` is true', () => {
    const cfg: LoginTermsConfig = { revisions: { terms: '2026-03-01' } }

    expect(resolveTerms(cfg)?.revisedAt).toBeUndefined()
    expect(resolveTerms({ ...cfg, showRevision: true })?.revisedAt).toBe('2026-03-01')
  })

  test('`revisedAt` is the LATEST revision among documents', () => {
    const cfg: LoginTermsConfig = {
      showRevision: true,
      billing: { href: 'https://a.test/billing', revisedAt: '2026-01-01' },
      revisions: { terms: '2026-06-01' },
    }

    expect(resolveTerms(cfg)?.revisedAt).toBe('2026-06-01')
  })
})

describe('termsSentence', () => {
  test('interpolates {{documents}} as a formatted, linked list', () => {
    const resolved = resolveTerms({
      terms: 'https://a.test/terms', billing: 'https://a.test/billing',
    })!

    const parts = termsSentence('I agree to the {{documents}}.', resolved, 'en', label)
    const linked = parts.filter(part => part.href != null)

    expect(linked.map(part => part.documentKey)).toEqual(['terms', 'billing'])
    expect(parts[0]).toEqual({ text: 'I agree to the ' })
    expect(parts.at(-1)).toEqual({ text: '.' })
  })

  test('interpolates {{notices}} the same way, from `resolved.notices`', () => {
    const resolved = resolveTerms({
      terms: 'https://a.test/terms', privacy: 'https://a.test/privacy', cookies: 'https://a.test/cookies',
    })!

    const parts = termsSentence('Data: {{notices}}.', resolved, 'en', label)
    const linked = parts.filter(part => part.href != null)

    expect(linked.map(part => part.documentKey)).toEqual(['privacy', 'cookies'])
  })

  test('supports the legacy {{terms}}/{{privacy}}/{{cookies}} placeholders', () => {
    const resolved = resolveTerms({
      terms: 'https://a.test/terms', privacy: 'https://a.test/privacy', cookies: 'https://a.test/cookies',
    })!

    const parts = termsSentence('{{terms}} and {{privacy}} and {{cookies}}', resolved, 'en', label)
    const linked = parts.filter(part => part.href != null)

    expect(linked.map(part => part.documentKey)).toEqual(['terms', 'privacy', 'cookies'])
    expect(linked.map(part => part.href))
      .toEqual(['https://a.test/terms', 'https://a.test/privacy', 'https://a.test/cookies'])
  })

  test('a single document renders with no list separator', () => {
    const resolved = resolveTerms({ terms: 'https://a.test/terms' })!

    const parts = termsSentence('{{documents}}', resolved, 'en', label)

    expect(parts).toEqual([{ text: 'Terms & Conditions', href: 'https://a.test/terms', documentKey: 'terms' }])
  })
})

describe('termsLabelResolver', () => {
  test('resolves a document label the same way the two renderers used to, by hand', () => {
    const translate = (key: string, defaultValue: string) => key === 'login.terms.custom' ? 'Custom!' : defaultValue
    const resolve = termsLabelResolver(translate, 'en')

    expect(resolve({ key: 'terms', href: 'https://a.test/terms', i18nKey: 'login.terms.terms' }))
      .toBe('Terms & Conditions')
    expect(resolve({ key: 'x', href: 'https://a.test/x', i18nKey: 'login.terms.custom' })).toBe('Custom!')
    expect(resolve({ key: 'x', href: 'https://a.test/x', label: 'Literal' })).toBe('Literal')
    expect(resolve({ key: 'x', href: 'https://a.test/x', labelMap: { en: 'English', fr: 'Français' } }))
      .toBe('English')
    expect(resolve({
      key: 'product', href: 'https://a.test/p', i18nKey: 'login.terms.product', params: { product: 'Acme' },
    })).toBe('{{product}} Product Terms'.replace('{{product}}', 'Acme'))
  })
})

describe('termsAcceptanceOf', () => {
  test('keeps only key/href/revisedAt — never i18nKey, params or label', () => {
    // A viable-shaped config: billing, a product document carrying `params`, and revisions —
    // exactly what `termsRecorder`/a Terms-mode consent screen sends the server.
    const resolved = resolveTerms({
      terms: 'https://a.test/terms', privacy: 'https://a.test/privacy', cookies: 'https://a.test/cookies',
      billing: { href: 'https://a.test/billing', revisedAt: '2026-02-01' },
      product: { name: 'Acme', href: 'https://a.test/product' },
      revisions: { terms: '2026-01-15', privacy: '2026-01-15' },
    })!

    const acceptance = termsAcceptanceOf(resolved, 'en')

    expect(acceptance.version).toBe(resolved.version)
    expect(acceptance.locale).toBe('en')
    expect(acceptance.documents).toEqual([
      { key: 'terms', href: 'https://a.test/terms', revisedAt: '2026-01-15' },
      { key: 'billing', href: 'https://a.test/billing', revisedAt: '2026-02-01' },
      { key: 'product', href: 'https://a.test/product', revisedAt: undefined },
    ])
    expect(acceptance.notices).toEqual([
      { key: 'privacy', href: 'https://a.test/privacy', revisedAt: '2026-01-15' },
      { key: 'cookies', href: 'https://a.test/cookies', revisedAt: undefined },
    ])
    // Every key is exactly {key, href, revisedAt} — no i18nKey, params or label leaked through.
    for (const doc of [...acceptance.documents, ...acceptance.notices]) {
      expect(Object.keys(doc).sort()).toEqual(['href', 'key', 'revisedAt'])
    }
  })

  test('omits `locale` entirely when none is given', () => {
    const resolved = resolveTerms({ terms: 'https://a.test/terms' })!

    expect(termsAcceptanceOf(resolved)).not.toHaveProperty('locale')
  })
})
