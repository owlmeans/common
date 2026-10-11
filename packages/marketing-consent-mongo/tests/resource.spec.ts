import { afterAll, describe, expect, test } from 'bun:test'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { MarketingConsentLogRecord, MarketingConsentStateRecord } from '@owlmeans/server-marketing-consent'
import { RES_MARKETING_CONSENT_LOG, RES_MARKETING_CONSENT_STATE } from '@owlmeans/server-marketing-consent'
import { appendMarketingConsentMongo } from '../src/helper.js'
import { gate, makeSuite } from './context.js'

const suite = makeSuite('mc-resource')
const it = gate.skip ? test.skip : test

const decision = (key: string) => ({
  key, granted: true, revisedAt: '2026-01-01T00:00:00.000Z', mode: 'opt-in' as const,
  decidedAt: '2026-01-01T00:00:00.000Z', source: 'settings' as const,
})

describe('@owlmeans/marketing-consent-mongo — resources against a real Mongo', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'mongo gate closed', () => {})

    return
  }

  afterAll(async () => {
    await suite.teardown()
  })

  it('stores a state record with a dotted consent key and reads it back verbatim', async () => {
    const { context } = await suite.boot()
    const state = context.resource<MongoResource<MarketingConsentStateRecord>>(RES_MARKETING_CONSENT_STATE)

    const now = new Date().toISOString()
    const created = await state.create({
      subject: 'subject-1',
      userId: 'user-1',
      // A dotted key ("marketing.email") is illegal as a Mongo FIELD name but fine as a plain
      // STRING VALUE inside an array element — the exact reason `decisions` is an array and not
      // an object keyed by consent key (see @owlmeans/server-marketing-consent's model.ts).
      decisions: [decision('marketing.email'), decision('data.profiling')],
      createdAt: now,
      updatedAt: now,
    })

    expect(typeof created.id).toBe('string')

    const reread = await state.get(created.id!)
    expect(reread.subject).toBe('subject-1')
    expect(reread.userId).toBe('user-1')
    expect(reread.decisions).toHaveLength(2)
    expect(reread.decisions.map(d => d.key)).toEqual(['marketing.email', 'data.profiling'])
    expect(reread.decisions[0]).toMatchObject(decision('marketing.email'))
    expect(reread.createdAt).toBe(now)
    expect(reread.updatedAt).toBe(now)
  })

  it('rejects a second state record for the same subject', async () => {
    const { context } = await suite.boot()
    const state = context.resource<MongoResource<MarketingConsentStateRecord>>(RES_MARKETING_CONSENT_STATE)

    const now = new Date().toISOString()
    await state.create({
      subject: 'subject-dup', userId: 'user-a', decisions: [], createdAt: now, updatedAt: now,
    })

    await expect(state.create({
      subject: 'subject-dup', userId: 'user-b', decisions: [], createdAt: now, updatedAt: now,
    })).rejects.toThrow()
  })

  it('stores an append-only log record', async () => {
    const { context } = await suite.boot()
    const log = context.resource<MongoResource<MarketingConsentLogRecord>>(RES_MARKETING_CONSENT_LOG)

    const now = new Date().toISOString()
    const created = await log.create({
      subject: 'subject-log', userId: 'user-log', kind: 'consent', key: 'marketing.email',
      granted: true, revisedAt: now, mode: 'opt-in', decidedAt: now, source: 'settings',
    })

    expect(typeof created.id).toBe('string')
    const reread = await log.get(created.id!)
    expect(reread.key).toBe('marketing.email')
    expect(reread.kind).toBe('consent')
  })

  it('appendMarketingConsentMongo is a no-op the second time it runs', async () => {
    const { context } = await suite.boot()

    expect(context.hasResource(RES_MARKETING_CONSENT_STATE)).toBe(true)
    expect(context.hasResource(RES_MARKETING_CONSENT_LOG)).toBe(true)

    const state = context.resource<MongoResource<MarketingConsentStateRecord>>(RES_MARKETING_CONSENT_STATE)
    const log = context.resource<MongoResource<MarketingConsentLogRecord>>(RES_MARKETING_CONSENT_LOG)

    expect(() => appendMarketingConsentMongo(context)).not.toThrow()

    // Same resource instances — nothing was re-registered.
    expect(context.resource<MongoResource<MarketingConsentStateRecord>>(RES_MARKETING_CONSENT_STATE)).toBe(state)
    expect(context.resource<MongoResource<MarketingConsentLogRecord>>(RES_MARKETING_CONSENT_LOG)).toBe(log)
  })
})
