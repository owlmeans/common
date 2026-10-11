import { describe, expect, test } from 'bun:test'
import { inquiryConfigHelper, type InquiryWidgetConfig } from '@owlmeans/common-inquiry'

const config = (patch: Partial<InquiryWidgetConfig> = {}): InquiryWidgetConfig => ({
  id: 'viable',
  tabs: [
    { alias: 'report-issue', title: { en: 'Report an issue', pl: 'Zgłoś problem' } },
    { alias: 'ask-question', title: 'Ask a question', description: { en: 'We answer within a day.' } },
  ],
  legal: { terms: 'https://owlmeans.com/legal/terms', privacy: '/legal/privacy' },
  ...patch,
})

describe('inquiryConfigHelper.text', () => {
  test('a plain string is the text of every language', () => {
    expect(inquiryConfigHelper.text('Hello', 'de')).toBe('Hello')
    expect(inquiryConfigHelper.text(undefined, 'de')).toBe('')
  })

  test('falls back from the exact tag to its primary subtag, then English, then the first entry', () => {
    const value = { en: 'Hello', pl: 'Cześć', 'pt-BR': 'Olá' }
    expect(inquiryConfigHelper.text(value, 'pl')).toBe('Cześć')
    expect(inquiryConfigHelper.text(value, 'pl-PL')).toBe('Cześć')
    expect(inquiryConfigHelper.text(value, 'pt')).toBe('Olá')
    expect(inquiryConfigHelper.text(value, 'de')).toBe('Hello')
    expect(inquiryConfigHelper.text({ uk: 'Привіт' }, 'de')).toBe('Привіт')
  })
})

describe('inquiryConfigHelper.validate', () => {
  test('a well-formed config has no errors — absolute and root-relative legal links alike', () => {
    expect(inquiryConfigHelper.validate(config())).toEqual([])
  })

  test('refuses an empty tab list, a bad id and a missing default tab', () => {
    expect(inquiryConfigHelper.validate(config({ tabs: [] }))).toEqual(['tabs must hold at least one tab'])
    expect(inquiryConfigHelper.validate(config({ id: 'Viable!' }))).toHaveLength(1)
    expect(inquiryConfigHelper.validate(config({ defaultTab: 'payment' }))).toEqual(['defaultTab "payment" names no tab'])
  })

  test('refuses malformed and duplicate aliases and empty titles', () => {
    const errors = inquiryConfigHelper.validate(config({
      tabs: [
        { alias: 'same', title: 'One' },
        { alias: 'same', title: 'Two' },
        { alias: '-bad', title: '' },
      ],
    }))
    expect(errors).toEqual([
      'tabs[1].alias "same" is not unique',
      'tabs[2].alias must match ^[a-z0-9][a-z0-9-]{0,31}$',
      'tabs[2].title must be a non-empty string or a map of language to non-empty string',
    ])
  })

  test('refuses a legal link that is neither http(s) nor root-relative', () => {
    const errors = inquiryConfigHelper.validate(config({
      legal: { terms: 'javascript:alert(1)', privacy: '//evil.example/privacy' },
    }))
    expect(errors).toEqual([
      'legal.terms must be an http(s) URL or a root-relative path',
      'legal.privacy must be an http(s) URL or a root-relative path',
    ])
  })
})

describe('inquiryConfigHelper.tabOf', () => {
  test('the named tab, else the default tab, else the first', () => {
    expect(inquiryConfigHelper.tabOf(config(), 'ask-question')?.alias).toBe('ask-question')
    expect(inquiryConfigHelper.tabOf(config({ defaultTab: 'ask-question' }), 'unknown')?.alias).toBe('ask-question')
    expect(inquiryConfigHelper.tabOf(config())?.alias).toBe('report-issue')
    expect(inquiryConfigHelper.tabOf(config({ tabs: [] }))).toBeUndefined()
  })
})

describe('inquiryConfigHelper.normalizeLanguage', () => {
  test('the primary subtag when supported, English otherwise', () => {
    expect(inquiryConfigHelper.normalizeLanguage('uk-UA')).toBe('uk')
    expect(inquiryConfigHelper.normalizeLanguage('DE_at')).toBe('de')
    expect(inquiryConfigHelper.normalizeLanguage('ja')).toBe('en')
    expect(inquiryConfigHelper.normalizeLanguage(undefined)).toBe('en')
    expect(inquiryConfigHelper.normalizeLanguage('ja', ['ja', 'en'], 'en')).toBe('ja')
  })
})
