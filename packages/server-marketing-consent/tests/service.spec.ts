import { describe, expect, test } from 'bun:test'
import { MARKETING_CONSENT_SERVICE, MC_EMAIL, MC_SMS } from '@owlmeans/marketing-consent'
import type { MarketingConsentDecision } from '@owlmeans/marketing-consent'
import { UnknownMarketingConsentError } from '@owlmeans/marketing-consent'
import type { Resource } from '@owlmeans/resource'
import { RES_MARKETING_CONSENT_LOG } from '../src/consts.js'
import type { MarketingConsentLogRecord } from '../src/model.js'
import type { MarketingConsentService } from '../src/service.js'
import type { MarketingConsentSubject } from '../src/subject.js'
import { makeTestContext, TEST_ENTITY, TEST_PROFILE, TEST_USER } from './context.js'

const subjectOf = (): MarketingConsentSubject => ({
  userId: TEST_USER, profileId: TEST_PROFILE, entityId: TEST_ENTITY,
})

const serviceOf = (context: ReturnType<typeof makeTestContext>): MarketingConsentService =>
  context.service<MarketingConsentService>(MARKETING_CONSENT_SERVICE)

const logOf = (context: ReturnType<typeof makeTestContext>): Resource<MarketingConsentLogRecord> =>
  context.resource<Resource<MarketingConsentLogRecord>>(RES_MARKETING_CONSENT_LOG)

describe('MarketingConsentService — status', () => {
  test('an unanswered subject sees every standard definition as new and pending', async () => {
    const context = makeTestContext()

    const view = await serviceOf(context).status(subjectOf())

    expect(view.pending).toBe(true)
    expect(view.items.length).toBeGreaterThan(0)
    expect(view.items.every(item => item.status === 'new')).toBe(true)
  })
})

describe('MarketingConsentService — save', () => {
  test('an unknown key throws UnknownMarketingConsentError', async () => {
    const context = makeTestContext()

    await expect(serviceOf(context).save(subjectOf(), {
      decisions: [{ key: 'not-a-real-key', granted: true }], source: 'settings',
    })).rejects.toBeInstanceOf(UnknownMarketingConsentError)
  })

  test('known keys are appended and the state is upserted', async () => {
    const context = makeTestContext()

    const result = await serviceOf(context).save(subjectOf(), {
      decisions: [{ key: MC_EMAIL, granted: true }, { key: MC_SMS, granted: false }], source: 'settings',
    })

    expect(result.ok).toBe(true)
    const email = result.status.items.find(item => item.definition.key === MC_EMAIL)
    const sms = result.status.items.find(item => item.definition.key === MC_SMS)
    expect(email?.status).toBe('current')
    expect(email?.granted).toBe(true)
    expect(sms?.granted).toBe(false)
  })

  test('a second save with a different decision for the same key updates it in place, never duplicates', async () => {
    const context = makeTestContext()
    const service = serviceOf(context)

    await service.save(subjectOf(), { decisions: [{ key: MC_EMAIL, granted: true }], source: 'settings' })
    const second = await service.save(subjectOf(), { decisions: [{ key: MC_EMAIL, granted: false }], source: 'settings' })

    // The status folds only the LATEST decision per key — the second save replaced the first.
    const email = second.status.items.find(item => item.definition.key === MC_EMAIL)
    expect(email?.granted).toBe(false)

    // The append-only log still carries both rows: one per save call, never overwritten.
    const { items } = await logOf(context).list({ key: MC_EMAIL })
    expect(items).toHaveLength(2)
  })
})

describe('MarketingConsentService — recordTerms', () => {
  test('records an append-only log row and upserts the state\'s terms field without touching decisions', async () => {
    const context = makeTestContext()
    const service = serviceOf(context)

    await service.save(subjectOf(), { decisions: [{ key: MC_EMAIL, granted: true }], source: 'settings' })
    await service.recordTerms(subjectOf(), {
      documents: [{ key: 'tos', href: 'https://example.com/tos' }], version: '1.0',
    })

    const view = await service.status(subjectOf())
    expect(view.terms?.version).toBe('1.0')
    // The earlier decision survived recording terms.
    const email = view.items.find(item => item.definition.key === MC_EMAIL)
    expect(email?.granted).toBe(true)

    const { items } = await logOf(context).list({ kind: 'terms' })
    expect(items).toHaveLength(1)
    expect(items[0]!.version).toBe('1.0')
  })
})

describe('MarketingConsentService — isGranted', () => {
  test('a saved, current decision is granted or not exactly as saved', async () => {
    const context = makeTestContext()
    const service = serviceOf(context)

    await service.save(subjectOf(), { decisions: [{ key: MC_EMAIL, granted: true }], source: 'settings' })

    expect(await service.isGranted(subjectOf(), MC_EMAIL)).toBe(true)
  })

  test('an unanswered opt-out item is NEVER granted server-side, even though it displays granted', async () => {
    // `resolveMarketingConsents`'s standard catalogue is opt-in only, so an opt-out definition is
    // added through config here. `consentStatus` (the UI-facing fold `status()` returns) answers
    // `granted: true` for an unanswered opt-out item — that is the CTA copy's "on until you turn
    // it off" display default. But nobody has actually confirmed anything yet (`status: 'new'`),
    // so the send/share gate `isGranted` guards must refuse it: only a `'current'` (i.e. actually
    // saved) decision may ever read as granted through this method.
    const context = makeTestContext({
      config: { custom: [{ key: 'test.optout', group: 'test', mode: 'opt-out', revisedAt: '2026-01-01' }] },
    })
    const service = serviceOf(context)

    const view = await service.status(subjectOf())
    const item = view.items.find(candidate => candidate.definition.key === 'test.optout')
    expect(item?.status).toBe('new')
    expect(item?.granted).toBe(true) // the display value

    expect(await service.isGranted(subjectOf(), 'test.optout')).toBe(false) // the gate value
  })

  test('an unknown key is never granted', async () => {
    const context = makeTestContext()

    expect(await serviceOf(context).isGranted(subjectOf(), 'no-such-key')).toBe(false)
  })
})

describe('MarketingConsentService — purge', () => {
  test('clears the state but keeps every log row', async () => {
    const context = makeTestContext()
    const service = serviceOf(context)

    await service.save(subjectOf(), { decisions: [{ key: MC_EMAIL, granted: true }], source: 'settings' })
    await service.purge(subjectOf())

    const view = await service.status(subjectOf())
    expect(view.items.every(item => item.status === 'new')).toBe(true)

    const { items } = await logOf(context).list({ key: MC_EMAIL })
    expect(items).toHaveLength(1) // the original save's log row is untouched by purge
  })
})

describe('MarketingConsentService — observe', () => {
  test('a throwing listener never blocks the write, and a working listener still fires', async () => {
    const context = makeTestContext()
    const service = serviceOf(context)

    let seen: MarketingConsentDecision[] | undefined
    service.observe(() => { throw new Error('boom') })
    service.observe(event => { seen = event.decisions })

    const result = await service.save(subjectOf(), { decisions: [{ key: MC_EMAIL, granted: true }], source: 'settings' })

    expect(result.ok).toBe(true)
    expect(seen?.[0]?.key).toBe(MC_EMAIL)
  })
})
