import { describe, expect, test } from 'bun:test'
import { CONSENT_ANALYTICS, CONSENT_MARKETING } from '@owlmeans/consent'
import { resolveMarketingConsents } from '../src/resolve.js'
import { MC_ADVERTISING, MC_ANALYTICS, MC_EMAIL, MC_PARTNERS, STANDARD_MARKETING_CONSENTS } from '../src/consts.js'

describe('resolveMarketingConsents', () => {
  test('the standard set has all 8 entries, in order, with no config', () => {
    const defs = resolveMarketingConsents()

    expect(defs).toHaveLength(8)
    expect(defs.map(def => def.key)).toEqual(STANDARD_MARKETING_CONSENTS.map(def => def.key))
    expect(defs.find(def => def.key === MC_ANALYTICS)?.cookieCategory).toBe(CONSENT_ANALYTICS)
    expect(defs.find(def => def.key === MC_ADVERTISING)?.cookieCategory).toBe(CONSENT_MARKETING)
  })

  test('a `standard: { key: false }` override drops that definition entirely', () => {
    const defs = resolveMarketingConsents({ standard: { [MC_EMAIL]: false } })

    expect(defs).toHaveLength(7)
    expect(defs.find(def => def.key === MC_EMAIL)).toBeUndefined()
  })

  test('a partial standard override merges over the standard one, key and group unchanged', () => {
    const defs = resolveMarketingConsents({
      standard: { [MC_EMAIL]: { labelKey: 'custom.email.label', group: 'ignored-group' } },
    })
    const email = defs.find(def => def.key === MC_EMAIL)

    expect(email?.labelKey).toBe('custom.email.label')
    expect(email?.group).toBe(STANDARD_MARKETING_CONSENTS.find(def => def.key === MC_EMAIL)?.group)
    expect(email?.key).toBe(MC_EMAIL)
  })

  test('`custom` adds a new definition, defaulted and appended after the standard set', () => {
    const defs = resolveMarketingConsents({
      custom: [{ key: 'custom.survey', group: 'custom' }],
    })
    const custom = defs.find(def => def.key === 'custom.survey')

    expect(defs).toHaveLength(9)
    expect(custom).toMatchObject({ key: 'custom.survey', group: 'custom', mode: 'opt-in', enabled: true })
    expect(custom?.revisedAt).toBeString()
  })

  test('a disabled custom entry is filtered out', () => {
    const defs = resolveMarketingConsents({
      custom: [{ key: 'custom.survey', group: 'custom', enabled: false }],
    })

    expect(defs.find(def => def.key === 'custom.survey')).toBeUndefined()
  })

  test('links merge into a definition, concatenated and de-duplicated by href', () => {
    const defs = resolveMarketingConsents({
      standard: { [MC_PARTNERS]: { links: [{ href: 'https://example.com/a' }] } },
      links: { [MC_PARTNERS]: [{ href: 'https://example.com/a' }, { href: 'https://example.com/b' }] },
    })
    const partners = defs.find(def => def.key === MC_PARTNERS)

    expect(partners?.links).toEqual([{ href: 'https://example.com/a' }, { href: 'https://example.com/b' }])
  })
})
