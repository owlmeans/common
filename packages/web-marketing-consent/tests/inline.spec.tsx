import { describe, expect, test } from 'bun:test'
import { renderToStaticMarkup } from 'react-dom/server'
import type { MarketingConsentDefinition } from '@owlmeans/marketing-consent'
import { carriesLinkToken, inlineLinks, localized, resolveLinks, rowTextOf } from '../src/components/inline.js'
import type { Translate } from '../src/components/inline.js'
import en from '../src/i18n/en.json' with { type: 'json' }
// The domain package's own strings (`consent.*`, `link.*`) — the other half of the one resource.
import domainEn from '../../marketing-consent/src/i18n/en.json' with { type: 'json' }

/** The package's own English strings, resolved the way the i18n runtime resolves a dotted key. */
const bundle: Record<string, unknown> = { ...domainEn, ...en }
const t: Translate = (key, defaultValue) => {
  const found = key.split('.').reduce<unknown>(
    (node, part) => (node != null && typeof node === 'object' ? (node as Record<string, unknown>)[part] : undefined),
    bundle,
  )

  return typeof found === 'string' ? found : defaultValue
}

const definition = (over: Partial<MarketingConsentDefinition> = {}): MarketingConsentDefinition => ({
  key: 'custom.training', group: 'data', mode: 'opt-in', enabled: true, revisedAt: '2026-09-25', ...over,
})

const html = (node: unknown): string => renderToStaticMarkup(<>{node as never}</>)

describe('inlineLinks', () => {
  const links = [
    { href: 'https://example.test/privacy', label: 'Privacy Policy' },
    { href: 'https://example.test/cookies', label: 'Cookie Policy' },
  ]

  test('draws each placeholder as an anchor, inside the sentence', () => {
    const out = html(inlineLinks('Read the {{link}} and the {{link2}}.', links))

    expect(out).toBe(
      'Read the <a href="https://example.test/privacy" target="_blank" rel="noreferrer noopener" '
      + 'data-marketing-consent-link="" class="underline underline-offset-2 hover:text-foreground">Privacy Policy</a> '
      + 'and the <a href="https://example.test/cookies" target="_blank" rel="noreferrer noopener" '
      + 'data-marketing-consent-link="" class="underline underline-offset-2 hover:text-foreground">Cookie Policy</a>.',
    )
  })

  test('accepts spaced placeholders and leaves text without one alone', () => {
    expect(html(inlineLinks('See {{ link }}.', links))).toContain('>Privacy Policy</a>.')
    expect(html(inlineLinks('Nothing to link here.', links))).toBe('Nothing to link here.')
  })

  test('with dropSentence, a placeholder nobody configured takes its whole sentence away', () => {
    const text = 'We write to you. How we handle your data is described in the {{link}}. You can withdraw at any time.'

    expect(html(inlineLinks(text, [], true))).toBe('We write to you. You can withdraw at any time.')
    expect(html(inlineLinks(text, [links[0]], true))).toContain('described in the <a ')
  })

  test('without dropSentence, only the placeholder itself is lost — a statement keeps its words', () => {
    expect(html(inlineLinks('I agree to the {{link}}', []))).toBe('I agree to the ')
  })

  test('a placeholder past the last link is dropped, not thrown on', () => {
    expect(html(inlineLinks('A {{link}} and {{link3}}.', [links[0]]))).toContain('and .')
  })
})

describe('localized', () => {
  const record = { en: 'Hello', pl: 'Cześć' }

  test('picks the exact language, then its base language, then English, then anything', () => {
    expect(localized(record, 'pl')).toBe('Cześć')
    expect(localized(record, 'pl-PL')).toBe('Cześć')
    expect(localized(record, 'de')).toBe('Hello')
    expect(localized({ fr: 'Salut' }, 'de')).toBe('Salut')
    expect(localized(undefined, 'en')).toBeUndefined()
  })
})

describe('resolveLinks', () => {
  test('a link is labelled by its per-language label, then its label key, then "Learn more"', () => {
    const links = resolveLinks(definition({
      links: [
        { href: '/a', label: { en: 'Own label', pl: 'Własna etykieta' } },
        { href: '/b', labelKey: 'link.privacy' },
        { href: '/c' },
      ],
    }), t, 'pl')

    expect(links.map(link => link.label)).toEqual(['Własna etykieta', 'Privacy Policy', 'Learn more'])
  })
})

describe('rowTextOf', () => {
  test('a standard consent reads its statement and detail from the bundle, with the link inside', () => {
    const row = rowTextOf(definition({
      key: 'marketing.email',
      labelKey: 'consent.marketing.email.label',
      descriptionKey: 'consent.marketing.email.description',
      links: [{ href: 'https://example.test/privacy', labelKey: 'link.privacy' }],
    }), t, 'en')

    expect(html(row.statement)).toStartWith('I confirm that I agree to receive')
    expect(html(row.detail)).toContain('described in the <a href="https://example.test/privacy"')
    expect(html(row.detail)).toContain('>Privacy Policy</a>.')
    expect(html(row.detail)).not.toContain('Learn more')
  })

  test('the same consent without links loses the sentence that pointed at one', () => {
    const row = rowTextOf(definition({
      key: 'marketing.email',
      labelKey: 'consent.marketing.email.label',
      descriptionKey: 'consent.marketing.email.description',
    }), t, 'en')

    expect(html(row.detail)).not.toContain('described in')
    expect(html(row.detail)).toContain('unsubscribe link.')
  })

  test('links whose text has no placeholder are appended to the detail as a link, never left stray', () => {
    const row = rowTextOf(definition({
      label: { en: 'I agree to the training use.' },
      description: { en: 'Sessions are used to improve the product.' },
      links: [{ href: 'https://example.test/training' }],
    }), t, 'en')

    expect(html(row.statement)).toBe('I agree to the training use.')
    expect(html(row.detail)).toStartWith('Sessions are used to improve the product. <a href="https://example.test/training"')
    expect(html(row.detail)).toContain('>Learn more</a>')
  })

  test('a custom consent with no keys renders its per-language text, not its key', () => {
    const custom = definition({
      label: { en: 'Training use', pl: 'Użycie do trenowania' },
      description: { en: 'Details in the {{link}}.' },
      links: [{ href: '/x', labelKey: 'link.privacy' }],
    })

    expect(html(rowTextOf(custom, t, 'pl').statement)).toBe('Użycie do trenowania')
    expect(html(rowTextOf(custom, t, 'de').statement)).toBe('Training use')
    expect(html(rowTextOf(custom, t, 'de').detail)).toContain('Details in the <a href="/x"')
  })

  test('a consent with neither keys nor text falls back to its key', () => {
    expect(html(rowTextOf(definition({ key: 'custom.bare' }), t, 'en').statement)).toBe('custom.bare')
    expect(rowTextOf(definition({ key: 'custom.bare' }), t, 'en').detail).toBeNull()
  })

  test('a statement keeps its words when its placeholder has no link', () => {
    const row = rowTextOf(definition({ label: { en: 'I agree, see the {{link}}' } }), t, 'en')

    expect(html(row.statement)).toBe('I agree, see the ')
  })
})

describe('carriesLinkToken', () => {
  test('sees every placeholder spelling', () => {
    expect(carriesLinkToken('a {{link}} b')).toBe(true)
    expect(carriesLinkToken('a {{link2}} b')).toBe(true)
    expect(carriesLinkToken('a {{ link }} b')).toBe(true)
    expect(carriesLinkToken('a {{date}} b')).toBe(false)
  })
})
