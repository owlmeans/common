import { afterAll, describe, expect, test } from 'bun:test'
import { TransitionAction, WorkcardKind } from '@owlmeans/planning'
import { introspectTable, planSync } from '@owlmeans/postgres-resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import { createBranch, LIBRARY } from '@owlmeans/server-planning/conformance'

import {
  PlanningPostgresError, RES_PLANNING_CARD, RES_PLANNING_LINK, RES_PLANNING_SCHEMA, RES_PLANNING_TRANSITION,
} from '../src/index.js'
import { gate, makeSuite } from './context.js'

const ALIASES = [RES_PLANNING_CARD, RES_PLANNING_TRANSITION, RES_PLANNING_LINK, RES_PLANNING_SCHEMA]

const suite = makeSuite('sync')
const it = gate.skip ? test.skip : test

describe('@owlmeans/planning-postgres — tables and wiring', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  afterAll(async () => {
    await suite.teardown()
  })

  it('a second boot reconciles nothing on any of the four tables', async () => {
    await suite.boot()
    const again = await suite.boot()
    const { pool } = await again.context.resource<PostgresResource<never>>(RES_PLANNING_CARD).db()
    const client = await pool.connect()
    try {
      for (const alias of ALIASES) {
        const table = again.context.resource<PostgresResource<never>>(alias).table
        const live = await introspectTable(client, table.schema, table.table, table.qualified)
        expect([alias, planSync(table, live).statements.map(statement => statement.sql)]).toEqual([alias, []])
      }
    } finally {
      client.release()
    }
  })

  it('names the file a missing resource is registered by', async () => {
    const bare = await suite.boot({ wiring: 'none' })
    const refusal = await bare.facade('library-1').execute({
      card: { kind: WorkcardKind.Project, type: LIBRARY.branch, title: 'Nowhere to go' }, action: TransitionAction.Create,
    }).catch(error => error)

    expect(refusal).toBeInstanceOf(PlanningPostgresError)
    expect(refusal.message).toBe('planning-postgres:resource-missing:planning-card: add src/resources/planning/card.ts')
  })

  it('appendPostgresPlanning registers the four resources and a working service in one call', async () => {
    const appended = await suite.boot({ wiring: 'append' })

    expect(ALIASES.every(alias => appended.context.hasResource(alias))).toBe(true)
    const branch = await createBranch(appended.facade('library-2'), 'Appended branch')
    expect((await appended.facade('library-2').cards.get(branch.id!)).title).toBe('Appended branch')
  })
})
