import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import {
  billingLanguageOf, chargeCurrencyOf, CONSUMER_RIGHTS_TERRITORIES, ConsumerRegion, ConsumerRightsError,
  ConsumerRightsPolicySchema, COUNTRY_LANGUAGES, DEFAULT_CONSUMER_RIGHTS, EEA_EXTRA, EU_CONSUMER_TERRITORIES,
  EU_COUNTRIES, inScope, isEeaCountry, isEuCountry, linksOf, makeConsumerRightsPolicy, regionOf,
} from '../src/index.js'
import type { ConsumerRightsPolicy } from '../src/index.js'

const ajv = new Ajv({ strict: false, validateFormats: false })

const links = {
  en: {
    billingTerms: 'https://example.com/en/billing-terms',
    withdrawalInformation: 'https://example.com/en/withdrawal',
    withdrawalFunction: 'https://app.example.com/legal/withdraw',
  },
  de: { billingTerms: 'https://example.com/de/abrechnungsbedingungen' },
}

const policy = (patch: Partial<ConsumerRightsPolicy> = {}): ConsumerRightsPolicy =>
  makeConsumerRightsPolicy({ textVersion: '2026-09-23', links, ...patch })

describe('territories', () => {
  test('the EU has 27 member states, Greece as GR', () => {
    expect(EU_COUNTRIES).toHaveLength(27)
    expect(new Set(EU_COUNTRIES).size).toBe(27)
    expect(EU_COUNTRIES).toContain('GR')
    expect(EU_COUNTRIES).not.toContain('EL')
    expect(EU_COUNTRIES).not.toContain('GB')
  })

  test('consumer territories add Åland and the French outermost regions; the EEA adds IS, LI, NO', () => {
    expect(EU_CONSUMER_TERRITORIES.filter(code => !EU_COUNTRIES.includes(code)).sort())
      .toEqual(['AX', 'GF', 'GP', 'MF', 'MQ', 'RE', 'YT'])
    expect(EEA_EXTRA).toEqual(['IS', 'LI', 'NO'])
    expect(CONSUMER_RIGHTS_TERRITORIES).toHaveLength(27 + 7 + 3)
    expect(DEFAULT_CONSUMER_RIGHTS.countries).toEqual([...CONSUMER_RIGHTS_TERRITORIES])
  })

  test('membership predicates are case-insensitive and exclude territories', () => {
    expect(isEuCountry('pl')).toBe(true)
    expect(isEuCountry('GF')).toBe(false)
    expect(isEuCountry('NO')).toBe(false)
    expect(isEeaCountry('NO')).toBe(true)
    expect(isEeaCountry('CH')).toBe(false)
    expect(isEuCountry(null)).toBe(false)
  })
})

describe('region, scope and currency', () => {
  test('a territory country is in the EU region; outside it is other; unknown is null', () => {
    expect(regionOf('DE')).toBe(ConsumerRegion.Eu)
    expect(regionOf('re')).toBe(ConsumerRegion.Eu)
    expect(regionOf('NO')).toBe(ConsumerRegion.Eu)
    expect(regionOf('US')).toBe(ConsumerRegion.Other)
    expect(regionOf('GB')).toBe(ConsumerRegion.Other)
    expect(regionOf(undefined)).toBeNull()
    expect(regionOf(' ')).toBeNull()
    expect(regionOf('US', { countries: ['US'] })).toBe(ConsumerRegion.Eu)
  })

  test('an unknown country is protected by default and can be ignored', () => {
    expect(inScope(null, 'FR', policy())).toBe(true)
    expect(inScope(null, 'US', policy())).toBe(false)
    expect(inScope(null, null, policy())).toBe(true)
    expect(inScope(null, null, policy({ unknownCountry: 'ignore' }))).toBe(false)
    expect(inScope(ConsumerRegion.Other, null, policy())).toBe(false)
    expect(inScope(null, null, null)).toBe(true)
  })

  test('the charge currency follows the region; an unknown region reads as EU', () => {
    const declared = policy({ currencies: { eu: 'eur', other: 'usd' } })
    expect(chargeCurrencyOf(ConsumerRegion.Eu, declared, 'usd')).toBe('eur')
    expect(chargeCurrencyOf(ConsumerRegion.Other, declared, 'eur')).toBe('usd')
    expect(chargeCurrencyOf(null, declared, 'usd')).toBe('eur')
    expect(chargeCurrencyOf(ConsumerRegion.Other, policy(), 'USD')).toBe('usd')
    expect(chargeCurrencyOf(ConsumerRegion.Eu, null, 'eur')).toBe('eur')
  })

  test('the legal language: policy map, then the unambiguous map, then the fallbacks', () => {
    expect(COUNTRY_LANGUAGES).not.toHaveProperty('BE')
    expect(COUNTRY_LANGUAGES).not.toHaveProperty('LU')
    expect(COUNTRY_LANGUAGES).not.toHaveProperty('CH')
    expect(billingLanguageOf('AT')).toBe('de')
    expect(billingLanguageOf('gp')).toBe('fr')
    expect(billingLanguageOf('BE', policy())).toBe('en')
    expect(billingLanguageOf('BE', policy(), 'fr')).toBe('fr')
    expect(billingLanguageOf('LU', policy({ languages: { LU: 'fr' } }))).toBe('fr')
    expect(billingLanguageOf('PL', policy({ languages: { PL: 'en' } }))).toBe('en')
    expect(billingLanguageOf(null, policy({ defaultLanguage: 'de', links: { ...links, de: links.de } }))).toBe('de')
  })
})

describe('the policy declaration', () => {
  test('fills the defaults and validates as a record', () => {
    const declared = policy({ mechanisms: { withdrawal: true } } as Partial<ConsumerRightsPolicy>)
    expect(declared).toMatchObject({
      withdrawalDays: 14, unknownCountry: 'protect', defaultLanguage: 'en',
      deadline: { weekendRollover: true, marginDays: 5 },
    })
    expect(declared.mechanisms.withdrawal).toBe(true)
    expect(declared.mechanisms.checkoutTerms).toBe(false)
    expect(ajv.validate(ConsumerRightsPolicySchema, declared)).toBe(true)
  })

  test('copies only its own fields — a server option never reaches the advertised record', () => {
    const declared = makeConsumerRightsPolicy({
      textVersion: 'v1', links, mail: { from: 'billing@example.com', bcc: ['archive@example.com'] },
    } as Parameters<typeof makeConsumerRightsPolicy>[0])
    expect(declared).not.toHaveProperty('mail')
    expect(ajv.validate(ConsumerRightsPolicySchema, declared)).toBe(true)
  })

  test('rejects what the law or the wire cannot take', () => {
    const cases: Array<[Partial<ConsumerRightsPolicy>, string]> = [
      [{ textVersion: ' ' }, 'text-version'],
      [{ withdrawalDays: 13 }, 'withdrawal-days'],
      [{ deadline: { weekendRollover: true, marginDays: 8 } }, 'margin-days'],
      [{ countries: ['Poland'] }, 'countries'],
      [{ currencies: { eu: 'EURO' } }, 'currencies'],
      [{ links: { de: links.de } }, 'links'],
      [{ links: { en: { billingTerms: 'http://example.com/terms' } } }, 'links'],
      [{ links: { ...links, de: { billingTerms: 'ftp://x' } } }, 'links:de'],
      [{ links: { en: { billingTerms: links.en.billingTerms } }, mechanisms: { performanceConsent: true } as ConsumerRightsPolicy['mechanisms'] }, 'links:withdrawal-information'],
    ]
    for (const [patch, field] of cases) {
      expect(() => policy(patch)).toThrow(`payment:consumer-rights:policy:${field}`)
      expect(() => policy(patch)).toThrow(ConsumerRightsError)
    }
  })

  test('links of a language fall back field by field to the default language', () => {
    const declared = policy()
    expect(linksOf(declared, 'de')).toEqual({ ...links.en, billingTerms: links.de.billingTerms })
    expect(linksOf(declared, 'de-AT').billingTerms).toBe(links.de.billingTerms)
    expect(linksOf(declared, 'fr')).toEqual(links.en)
    expect(linksOf(declared)).toEqual(links.en)
  })
})
