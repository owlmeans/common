import { describe, expect, test } from 'bun:test'
import { consentStatus } from '../src/resolve.js'
import type { MarketingConsentDecision, MarketingConsentDefinition } from '../src/types.js'

const optIn: MarketingConsentDefinition = {
  key: 'a.optin', group: 'g', mode: 'opt-in', enabled: true, revisedAt: 'r1',
}
const optOut: MarketingConsentDefinition = {
  key: 'b.optout', group: 'g', mode: 'opt-out', enabled: true, revisedAt: 'r1',
}
const optOutGpc: MarketingConsentDefinition = {
  key: 'c.optout-gpc', group: 'g', mode: 'opt-out', enabled: true, revisedAt: 'r1', honorGpc: true,
}

const decisionFor = (
  definition: MarketingConsentDefinition, over: Partial<MarketingConsentDecision> = {},
): MarketingConsentDecision => ({
  key: definition.key, granted: true, revisedAt: definition.revisedAt, mode: definition.mode,
  decidedAt: '2026-01-01T00:00:00.000Z', source: 'settings', ...over,
})

describe('consentStatus', () => {
  test('no saved decision, opt-in -> new, not granted, not updated (no history at all)', () => {
    const view = consentStatus([optIn], [])

    expect(view.items[0]).toMatchObject({ status: 'new', granted: false, updated: false })
    expect(view.pending).toBe(true)
  })

  test('no saved decision, opt-out -> new, granted by default', () => {
    const view = consentStatus([optOut], [])

    expect(view.items[0]).toMatchObject({ status: 'new', granted: true, updated: false })
  })

  test('no saved decision, opt-out with honorGpc and gpc set -> new, not granted', () => {
    const view = consentStatus([optOutGpc], [], { gpc: true })

    expect(view.items[0]).toMatchObject({ status: 'new', granted: false })
  })

  test('no saved decision, opt-out with honorGpc but gpc not set -> new, granted', () => {
    const view = consentStatus([optOutGpc], [], { gpc: false })

    expect(view.items[0]).toMatchObject({ status: 'new', granted: true })
  })

  test('a new definition is "updated" when the person has saved consents before, just never this one', () => {
    const other: MarketingConsentDefinition = { ...optIn, key: 'z.other' }
    const view = consentStatus([optIn], [decisionFor(other)])
    const item = view.items.find(entry => entry.definition.key === optIn.key)

    expect(item).toMatchObject({ status: 'new', updated: true })
  })

  test('a matching saved decision -> current, granted mirrors the saved answer', () => {
    const grantedTrue = consentStatus([optIn], [decisionFor(optIn, { granted: true })])
    const grantedFalse = consentStatus([optIn], [decisionFor(optIn, { granted: false })])

    expect(grantedTrue.items[0]).toMatchObject({ status: 'current', granted: true, updated: false })
    expect(grantedFalse.items[0]).toMatchObject({ status: 'current', granted: false, updated: false })
    expect(grantedTrue.pending).toBe(false)
  })

  test('a saved decision under an earlier revision -> revised, opt-in resets to not granted', () => {
    const saved = decisionFor(optIn, { granted: true, revisedAt: 'r0' })
    const view = consentStatus([optIn], [saved])

    expect(view.items[0]).toMatchObject({ status: 'revised', granted: false, updated: true })
    expect(view.pending).toBe(true)
  })

  test('a saved decision whose mode changed -> revised, even with the current revisedAt', () => {
    const saved = decisionFor(optIn, { granted: true, mode: 'opt-out' })
    const view = consentStatus([optIn], [saved])

    expect(view.items[0].status).toBe('revised')
  })

  test('revised opt-out keeps the person\'s last answer', () => {
    const grantedTrue = consentStatus([optOut], [decisionFor(optOut, { granted: true, revisedAt: 'r0' })])
    const grantedFalse = consentStatus([optOut], [decisionFor(optOut, { granted: false, revisedAt: 'r0' })])

    expect(grantedTrue.items[0]).toMatchObject({ status: 'revised', granted: true })
    expect(grantedFalse.items[0]).toMatchObject({ status: 'revised', granted: false })
  })

  test('revised opt-out with honorGpc and gpc set forces not granted regardless of the saved answer', () => {
    const saved = decisionFor(optOutGpc, { granted: true, revisedAt: 'r0' })
    const view = consentStatus([optOutGpc], [saved], { gpc: true })

    expect(view.items[0]).toMatchObject({ status: 'revised', granted: false })
  })

  test('the latest decision by decidedAt wins when a key has a history of decisions', () => {
    const older = decisionFor(optIn, { granted: false, decidedAt: '2026-01-01T00:00:00.000Z' })
    const newer = decisionFor(optIn, { granted: true, decidedAt: '2026-02-01T00:00:00.000Z' })
    const view = consentStatus([optIn], [older, newer])

    expect(view.items[0]).toMatchObject({ status: 'current', granted: true })
  })

  test('terms are attached only when termsAcceptedAt is given', () => {
    const without = consentStatus([optIn], [])
    const withTerms = consentStatus([optIn], [], { termsAcceptedAt: '2026-01-01T00:00:00.000Z', termsVersion: 'v1' })

    expect(without.terms).toBeUndefined()
    expect(withTerms.terms).toEqual({ version: 'v1', acceptedAt: '2026-01-01T00:00:00.000Z' })
  })

  test('pending is false only when every item is current', () => {
    const allCurrent = consentStatus([optIn], [decisionFor(optIn)])
    const oneNew = consentStatus([optIn, optOut], [decisionFor(optIn)])

    expect(allCurrent.pending).toBe(false)
    expect(oneNew.pending).toBe(true)
  })
})
