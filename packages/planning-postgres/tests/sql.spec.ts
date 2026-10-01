import { describe, expect, test } from 'bun:test'
import { schemaToTableSpec } from '@owlmeans/postgres-resource'

import {
  insertOf, pgFault, planningChannel, PlanningLinkTableSchema, PlanningPostgresError, RES_PLANNING_LINK, whereOf,
} from '../src/index.js'

const links = schemaToTableSpec(RES_PLANNING_LINK, PlanningLinkTableSchema, 'app', 'planning_link', true)

describe('@owlmeans/planning-postgres — statements', () => {
  test('a fixed-field where binds every value and reads a list as = ANY', () => {
    const where = whereOf(links, { entityId: 'library-1', from: ['a', 'b'], to: undefined, type: 'sequel-of' }, 2)

    expect(where.text).toBe('"entityId" = $3 AND "from" = ANY($4) AND "type" = $5')
    expect(where.params).toEqual(['library-1', ['a', 'b'], 'sequel-of'])
    expect(whereOf(links, {}).text).toBe('TRUE')
  })

  test('an insert names every column, JSON-encodes jsonb and binds absence as null', () => {
    const insert = insertOf(links, {
      id: 'l1', entityId: 'library-1', type: 'sequel-of', from: 'b2', to: 'b1', fields: { shelf: 3 }, createdAt: '2026-01-01T00:00:00.000Z',
    }, { tail: 'RETURNING *' })

    expect(insert.text).toStartWith(`INSERT INTO "app"."planning_link" (`)
    expect(insert.text).toEndWith(' RETURNING *')
    expect(insert.params).toContain('{"shelf":3}')
    expect(insert.params.filter(value => value === null)).toHaveLength(2)
  })

  test('a driver fault is read through its cause chain', () => {
    const driver = Object.assign(new Error('duplicate key'), { code: '23505', constraint: 'planning_link_edge' })
    const wrapped = Object.assign(new Error('query failed'), { cause: driver })

    expect(pgFault(wrapped)).toEqual({ code: '23505', constraint: 'planning_link_edge' })
    expect(pgFault(new Error('plain'))).toEqual({})
  })

  test('the channel is a short identifier of the qualified table, different per schema', () => {
    const first = planningChannel('"branch_a"."planning_transition"')
    const second = planningChannel('"branch_b"."planning_transition"')

    expect(first).toMatch(/^planning_[0-9a-f]{16}$/)
    expect(first).not.toBe(second)
    expect(planningChannel('"branch_a"."planning_transition"')).toBe(first)
  })

  test('its faults carry the package marker', () => {
    expect(new PlanningPostgresError('resource-missing:planning-card').message).toBe('planning-postgres:resource-missing:planning-card')
  })
})
