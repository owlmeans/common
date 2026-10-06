import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { makePostgresResource } from '@owlmeans/postgres-resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import { recordQueryHelper, UnsupportedArgumentError } from '@owlmeans/resource'
import type { Criteria, ResourceRecord } from '@owlmeans/resource'

import { gate, makeSuite } from './context.js'

interface Plot extends ResourceRecord {
  id?: string
  garden: string
  crops: string[]
  soil: Record<string, unknown>
  season?: string
}

/** A community garden: plots carry a native text[] of crops and a jsonb soil report. */
const plotSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    garden: { type: 'string' },
    crops: { type: 'array', items: { type: 'string' } },
    soil: { type: 'object' },
    season: { type: 'string', nullable: true }
  },
  required: ['id', 'garden', 'crops', 'soil']
} as never

const suite = makeSuite('criteria')
const it = gate.skip ? test.skip : test

describe('@owlmeans/postgres — criteria answer what the in-memory engine answers', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'postgres gate closed', () => {})

    return
  }

  let plots: PostgresResource<Plot>
  let seeded: Plot[]

  beforeAll(async () => {
    const resource = makePostgresResource<Plot, PostgresResource<Plot>>('criteria-plots')
    resource.schema = plotSchema
    const booted = await suite.boot({ resources: [resource] })
    plots = booted.context.resource<PostgresResource<Plot>>('criteria-plots')

    seeded = []
    for (const plot of [
      { garden: 'north', crops: ['beans', 'kale'], soil: { ph: 6.5, wet: true, beds: ['a', 'b'], state: 'loam' }, season: 'spring' },
      { garden: 'north', crops: ['kale'], soil: { ph: 7, wet: false, beds: ['c'], state: 'clay', 'a,b': 1 } },
      { garden: 'south', crops: [], soil: { ph: 5.5, state: null, beds: [] }, season: 'autumn' },
    ]) {
      seeded.push(await plots.create(plot))
    }
  })

  afterAll(async () => {
    await suite.teardown()
  })

  const byBoth = async (criteria: Criteria<Plot>): Promise<void> => {
    const listed = (await plots.list(criteria, { size: 0 })).items.map(plot => plot.id).sort()
    const expected = seeded.filter(plot => recordQueryHelper.matchCriteria(plot, criteria)).map(plot => plot.id).sort()
    expect([JSON.stringify(criteria), listed]).toEqual([JSON.stringify(criteria), expected])
  }

  it('native array operators take a list or a scalar', async () => {
    await byBoth({ crops: { $contains: 'kale' } })
    await byBoth({ crops: { $contains: ['beans', 'kale'] } })
    await byBoth({ crops: { $overlaps: ['beans', 'rye'] } })
    await byBoth({ crops: { $overlaps: 'rye' } })
    await byBoth({ crops: { $contained: ['kale', 'beans', 'rye'] } })
  })

  it('dotted jsonb paths compare typed values, lists, null and operators', async () => {
    await byBoth({ 'soil.ph': 7 } as Criteria<Plot>)
    await byBoth({ 'soil.wet': true } as Criteria<Plot>)
    await byBoth({ 'soil.state': ['loam', 'clay'] } as Criteria<Plot>)
    await byBoth({ 'soil.state': null } as Criteria<Plot>)
    await byBoth({ 'soil.state': { $in: ['clay', null] } } as Criteria<Plot>)
    /** `$nin` reads as it does on a column: `NOT IN`, which never matches an absent value. */
    expect((await plots.list({ 'soil.state': { $nin: ['clay'] } } as Criteria<Plot>, { size: 0 })).items.map(plot => plot.garden))
      .toEqual(['north'])
    await byBoth({ 'soil.ph': { $gte: 6.5 } } as Criteria<Plot>)
    await byBoth({ 'soil.state': { $startsWith: 'lo' } } as Criteria<Plot>)
    await byBoth({ 'soil.state': { $exists: true } } as Criteria<Plot>)
    await byBoth({ 'soil.beds': { $contains: 'a' } } as Criteria<Plot>)
    await byBoth({ 'soil.beds': { $overlaps: ['c', 'z'] } } as Criteria<Plot>)
    await byBoth({ 'soil.a,b': 1 } as Criteria<Plot>)
  })

  it('counts per group in one round trip', async () => {
    const counts = await plots.countBy({ crops: { $contains: 'kale' } }, ['garden'])
    expect(counts).toEqual([{ garden: 'north', count: 2 }])

    const grouped = (await plots.countBy(undefined, ['garden', 'season']))
      .sort((left, right) => `${left.garden}${left.season}`.localeCompare(`${right.garden}${right.season}`))
    expect(grouped).toEqual([
      { garden: 'north', season: null, count: 1 },
      { garden: 'north', season: 'spring', count: 1 },
      { garden: 'south', season: 'autumn', count: 1 },
    ])
    await expect(plots.countBy(undefined, ['nope' as never])).rejects.toThrow(UnsupportedArgumentError)
  })
})
