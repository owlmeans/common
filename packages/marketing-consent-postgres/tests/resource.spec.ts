import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { RecordExists } from '@owlmeans/resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import {
  RES_MARKETING_CONSENT_LOG, RES_MARKETING_CONSENT_STATE
} from '@owlmeans/server-marketing-consent'
import type {
  MarketingConsentLogRecord, MarketingConsentStateRecord
} from '@owlmeans/server-marketing-consent'

import { appendMarketingConsentPostgres } from '../src/index.js'
import type { Booted } from './context.js'
import { gate, makeSuite } from './context.js'

/**
 * Env-gated against a real Postgres — skips cleanly (never fails) when `POSTGRES_URL` isn't
 * reachable, the same gate `@owlmeans/postgres-resource`'s own integration suites use.
 */
const suite = makeSuite('resource')
const it = gate.skip ? test.skip : test

describe('@owlmeans/marketing-consent-postgres — resources against a real context', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  let booted: Booted
  let state: PostgresResource<MarketingConsentStateRecord>
  let log: PostgresResource<MarketingConsentLogRecord>

  beforeAll(async () => {
    booted = await suite.boot()
    state = booted.context.resource<PostgresResource<MarketingConsentStateRecord>>(
      RES_MARKETING_CONSENT_STATE
    )
    log = booted.context.resource<PostgresResource<MarketingConsentLogRecord>>(
      RES_MARKETING_CONSENT_LOG
    )
  })

  afterAll(async () => {
    await suite.teardown()
  })

  it('reconciles both tables at boot without error', () => {
    /** `beforeAll` already drove `context.init()` — reaching here at all is the assertion. */
    expect(state.table.qualified).toBe(`"${suite.schema}"."marketing_consent_state"`)
    expect(log.table.qualified).toBe(`"${suite.schema}"."marketing_consent_log"`)
  })

  it('stores a dotted decision key verbatim and reads it back', async () => {
    const record = await state.create({
      subject: 'ent-1|user-1|',
      userId: 'user-1',
      entityId: 'ent-1',
      decisions: [
        {
          key: 'marketing.email', granted: true, revisedAt: '2026-01-01T00:00:00.000Z',
          mode: 'opt-in', decidedAt: '2026-01-01T00:00:00.000Z', source: 'settings'
        },
        {
          key: 'trackers.advertising', granted: false, revisedAt: '2026-01-01T00:00:00.000Z',
          mode: 'opt-out', decidedAt: '2026-01-01T00:00:00.000Z', source: 'settings'
        }
      ],
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    })

    const loaded = await state.get(record.id as string)
    /** Verbatim array, not folded into an object keyed by the dotted consent key. */
    expect(loaded.decisions).toEqual([
      {
        key: 'marketing.email', granted: true, revisedAt: '2026-01-01T00:00:00.000Z',
        mode: 'opt-in', decidedAt: '2026-01-01T00:00:00.000Z', source: 'settings'
      },
      {
        key: 'trackers.advertising', granted: false, revisedAt: '2026-01-01T00:00:00.000Z',
        mode: 'opt-out', decidedAt: '2026-01-01T00:00:00.000Z', source: 'settings'
      }
    ])
    expect(Array.isArray(loaded.decisions)).toBe(true)
  })

  it('rejects a duplicate subject through the unique index', async () => {
    await state.create({
      subject: 'ent-2|user-2|', userId: 'user-2', decisions: [],
      createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z'
    })

    await expect(state.create({
      subject: 'ent-2|user-2|', userId: 'user-2', decisions: [],
      createdAt: '2026-01-02T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z'
    })).rejects.toThrow(RecordExists)
  })

  it('appends a log row untouched by state writes', async () => {
    const row = await log.create({
      subject: 'ent-3|user-3|', userId: 'user-3', kind: 'consent', key: 'marketing.email',
      granted: true, mode: 'opt-in', decidedAt: '2026-01-01T00:00:00.000Z', source: 'settings'
    })

    expect(await log.get(row.id as string)).toMatchObject({ key: 'marketing.email', granted: true })
  })

  it('is a no-op the second time it registers on the same context', () => {
    const before = booted.context.resource<PostgresResource<MarketingConsentStateRecord>>(
      RES_MARKETING_CONSENT_STATE
    )

    appendMarketingConsentPostgres(booted.context)

    const after = booted.context.resource<PostgresResource<MarketingConsentStateRecord>>(
      RES_MARKETING_CONSENT_STATE
    )
    /** Same registered instance — the second call never re-registered a resource. */
    expect(after).toBe(before)
  })
})
