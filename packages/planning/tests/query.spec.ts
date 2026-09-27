import { describe, expect, test } from 'bun:test'
import { applyQuery } from '@owlmeans/resource'
import { IntrinsicStatus, WorkcardKind } from '../src/consts.js'
import { PlanningError } from '../src/errors.js'
import {
  criteriaOf, decodeSummaryQuery, decodeWorkcardQuery, encodeSummaryQuery, encodeWorkcardQuery, listOptionsOf,
  summaryOf,
} from '../src/helpers/query.js'
import type { Workcard, WorkcardQuery } from '../src/types.js'
import { AT, ENTITY } from './fixtures.js'

const card = (id: string, extra: Partial<Workcard>): Workcard => ({
  id, kind: WorkcardKind.Card, type: 'test:story', entityId: ENTITY, title: `Card ${id}`, parent: 'p1',
  parents: ['p1'], status: 'planned', intrinsic: IntrinsicStatus.Planned, flows: { 'test:story': 'planned' },
  labels: [], fields: {}, seq: 1, createdAt: AT, ...extra,
})

const CARDS = [
  card('a', { code: 'US-AAA', labels: ['ui'], fields: { area: 'user' }, order: 2 }),
  card('b', { code: 'US-BBB', status: 'completed', intrinsic: IntrinsicStatus.Closed, parents: ['p1', 'p2'], order: 1 }),
  card('c', { entityId: 'other', code: 'US-CCC' }),
  card('d', { title: '50% off_sale', parent: 'p2', parents: ['p2'], fields: { area: 'guest' } }),
]

const ids = (query: WorkcardQuery): string[] =>
  applyQuery(CARDS, criteriaOf(query, { entityId: ENTITY }), listOptionsOf(query)).items.map(item => item.id!)

describe('criteriaOf', () => {
  test('translates the table, always scoped to the entity and omitting what is undefined', () => {
    expect(criteriaOf({
      kind: WorkcardKind.Card, type: ['test:story', 'test:task'], parent: 'p1', within: 'p2', status: undefined,
      labels: ['ui'], ids: ['a'], flow: { id: 'test:story', status: ['planned'] }, fields: { area: 'user' },
      code: 'US-AAA', updatedSince: AT,
    }, { entityId: ENTITY }) as Record<string, unknown>).toEqual({
      entityId: ENTITY, kind: WorkcardKind.Card, type: ['test:story', 'test:task'], parent: 'p1',
      parents: { $contains: 'p2' }, labels: { $overlaps: ['ui'] }, id: { $in: ['a'] },
      'flows.test:story': ['planned'], 'fields.area': 'user', code: 'US-AAA', updatedAt: { $gte: AT },
    })
  })

  test('means the same thing to the in-memory engine: membership, labels, fields, code and sort', () => {
    expect(ids({})).toEqual(['a', 'b', 'd'])
    expect(ids({ within: 'p2', sort: ['order'] })).toEqual(['b', 'd'])
    expect(ids({ labels: ['ui', 'api'] })).toEqual(['a'])
    expect(ids({ fields: { area: 'guest' } })).toEqual(['d'])
    expect(ids({ code: ['US-BBB', 'US-CCC'], intrinsic: IntrinsicStatus.Closed })).toEqual(['b'])
  })

  test('a search matches title text literally and a code prefix', () => {
    expect(ids({ q: '50%' })).toEqual(['d'])
    expect(ids({ q: '%' })).toEqual(['d'])
    expect(ids({ q: 'US-A' })).toEqual(['a'])
  })
})

describe('wire queries', () => {
  test('a rich query survives encode → decode into the same criteria', () => {
    const query: WorkcardQuery = {
      kind: WorkcardKind.Card, type: ['test:story', 'test:task'], parent: 'p1', labels: ['a,b', 'c'], ids: ['x'],
      flow: { id: 'test:story', status: ['planned', 'failed'] }, fields: { area: 'user', primary: true },
      q: 'sign in', page: 1, size: 20, sort: ['order', { field: 'updatedAt', order: 'desc' }],
    }
    const wire = encodeWorkcardQuery(query)

    expect(Object.values(wire).every(value => typeof value === 'string' || typeof value === 'number')).toBe(true)
    expect(wire.sort).toBe('order,-updatedAt')
    expect(criteriaOf(decodeWorkcardQuery(wire), { entityId: ENTITY })).toEqual(criteriaOf(query, { entityId: ENTITY }))
    expect(listOptionsOf(decodeWorkcardQuery(wire))).toEqual({ page: 1, size: 20, sort: ['order', { field: 'updatedAt', order: 'desc' }] })
  })

  test('decode accepts what a transport may have split already, and coerces numbers', () => {
    expect(decodeWorkcardQuery({ status: ['planned', 'failed'], size: '10', labels: 'ui' } as never))
      .toEqual({ status: ['planned', 'failed'], size: 10, labels: ['ui'] })
    expect(decodeSummaryQuery(encodeSummaryQuery({ parents: ['p1', 'p2'], type: 'test:story' })))
      .toEqual({ parents: ['p1', 'p2'], type: 'test:story' })
  })

  test('a value that does not decode is a malformed query', () => {
    expect(() => decodeWorkcardQuery({ fields: '{broken' })).toThrow(PlanningError)
    expect(() => decodeWorkcardQuery({ size: 'many' } as never)).toThrow('malformed:query:size')
  })
})

describe('summaryOf', () => {
  test('counts direct children per parent by intrinsic state, with no key for a parent without any', () => {
    expect(summaryOf(CARDS.filter(item => item.entityId === ENTITY), ['p1', 'p3'])).toEqual({
      p1: { total: 2, planned: 1, 'in-progress': 0, closed: 1 },
    })
  })
})
