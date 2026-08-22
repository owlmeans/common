import { describe, expect, test } from 'bun:test'
import { filterRecords, matchCriteria, sortRecords } from '@owlmeans/state'

interface Task {
  id?: string
  title?: string
  status?: string
  points?: number
  tags?: string[]
  owner?: { name?: string, team?: string }
  due?: Date
}

const tasks: Task[] = [
  { id: 'a', title: 'Alpha', status: 'open', points: 3, tags: ['ui', 'urgent'], owner: { name: 'ann', team: 'core' } },
  { id: 'b', title: 'Beta', status: 'done', points: 8, tags: ['api'], owner: { name: 'bob', team: 'core' } },
  { id: 'c', title: 'Gamma', status: 'open', points: 1, tags: [], owner: { name: 'cid', team: 'ops' } },
  { id: 'd', title: 'Delta', points: 5 },
]

const ids = (records: Task[]): string[] => records.map(record => record.id!)

describe('@owlmeans/state — criteria', () => {
  test('a bare value is field equality', () => {
    expect(ids(filterRecords(tasks, { status: 'open' }))).toEqual(['a', 'c'])
  })

  // The same shape reaching a postgres resource means IN, so it has to mean IN here too —
  // otherwise one filter object answers two different questions depending on who evaluates it.
  test('a bare array is $in', () => {
    expect(ids(filterRecords(tasks, { status: ['open', 'done'] }))).toEqual(['a', 'b', 'c'])
  })

  test('comparison operators', () => {
    expect(ids(filterRecords(tasks, { points: { $gte: 5 } }))).toEqual(['b', 'd'])
    expect(ids(filterRecords(tasks, { points: { $lt: 3 } }))).toEqual(['c'])
    expect(ids(filterRecords(tasks, { points: { $gt: 1, $lte: 5 } }))).toEqual(['a', 'd'])
    expect(ids(filterRecords(tasks, { status: { $ne: 'open' } }))).toEqual(['b', 'd'])
  })

  test('$in, $nin, $exists, $null', () => {
    expect(ids(filterRecords(tasks, { id: { $in: ['a', 'd'] } }))).toEqual(['a', 'd'])
    expect(ids(filterRecords(tasks, { id: { $nin: ['a', 'd'] } }))).toEqual(['b', 'c'])
    expect(ids(filterRecords(tasks, { status: { $exists: false } }))).toEqual(['d'])
    expect(ids(filterRecords(tasks, { status: { $null: true } }))).toEqual(['d'])
  })

  test('text operators', () => {
    expect(ids(filterRecords(tasks, { title: { $startsWith: 'A' } }))).toEqual(['a'])
    expect(ids(filterRecords(tasks, { title: { $endsWith: 'a' } }))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(filterRecords(tasks, { title: { $endsWith: 'ta' } }))).toEqual(['b', 'd'])
    expect(ids(filterRecords(tasks, { title: { $like: '%amm%' } }))).toEqual(['c'])
    expect(ids(filterRecords(tasks, { title: { $ilike: 'alpha' } }))).toEqual(['a'])
    expect(ids(filterRecords(tasks, { title: { $regex: '^(Al|Be)' } }))).toEqual(['a', 'b'])
  })

  test('$between spans inclusively and rejects a malformed operand', () => {
    expect(ids(filterRecords(tasks, { points: { $between: [3, 5] } }))).toEqual(['a', 'd'])
    expect(() => filterRecords(tasks, { points: { $between: [3] } as never })).toThrow()
  })

  test('array operators', () => {
    expect(ids(filterRecords(tasks, { tags: { $contains: 'urgent' } }))).toEqual(['a'])
    expect(ids(filterRecords(tasks, { tags: { $overlaps: ['api', 'urgent'] } }))).toEqual(['a', 'b'])
  })

  test('logical operators nest', () => {
    expect(ids(filterRecords(tasks, { $or: [{ status: 'done' }, { points: { $lt: 2 } }] }))).toEqual(['b', 'c'])
    expect(ids(filterRecords(tasks, { $and: [{ status: 'open' }, { points: { $gt: 2 } }] }))).toEqual(['a'])
    expect(ids(filterRecords(tasks, { $not: { status: 'open' } }))).toEqual(['b', 'd'])
  })

  test('a dotted key reaches into the record', () => {
    expect(ids(filterRecords(tasks, { 'owner.team': 'core' }))).toEqual(['a', 'b'])
    expect(ids(filterRecords(tasks, { 'owner.name': { $in: ['cid'] } }))).toEqual(['c'])
  })

  // An optional filter with nothing chosen arrives as `undefined`. Comparing against it would
  // filter the list down to records that lack the property — an empty screen for a dropdown the
  // user never touched.
  test('an undefined criteria value is skipped, null is a real IS NULL', () => {
    expect(ids(filterRecords(tasks, { status: undefined }))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(filterRecords(tasks, { status: null as never }))).toEqual(['d'])
  })

  // No schema means no way to tell a typo from a property this record simply lacks. Postgres
  // throws; here the honest answer is that nothing matches.
  test('an unknown key matches nothing rather than throwing', () => {
    expect(ids(filterRecords(tasks, { nonesuch: 'x' }))).toEqual([])
    expect(matchCriteria(tasks[0]!, { nonesuch: 'x' })).toBe(false)
  })

  test('an unknown operator is rejected', () => {
    expect(() => filterRecords(tasks, { points: { $nope: 1 } as never })).toThrow()
  })

  test('empty criteria keeps everything', () => {
    expect(ids(filterRecords(tasks, {}))).toEqual(['a', 'b', 'c', 'd'])
    expect(ids(filterRecords(tasks, undefined))).toEqual(['a', 'b', 'c', 'd'])
  })

  test('dates compare by instant', () => {
    const dated: Task[] = [
      { id: 'x', due: new Date('2026-01-01') },
      { id: 'y', due: new Date('2026-06-01') },
    ]
    expect(ids(filterRecords(dated, { due: { $gt: new Date('2026-03-01') } }))).toEqual(['y'])
  })

  test('sort ascending, descending and by a dotted key; absent values sort last', () => {
    expect(ids(sortRecords(tasks, ['points']))).toEqual(['c', 'a', 'd', 'b'])
    expect(ids(sortRecords(tasks, [['points', true]]))).toEqual(['b', 'd', 'a', 'c'])
    expect(ids(sortRecords(tasks, ['owner.name']))).toEqual(['a', 'b', 'c', 'd'])
  })

  test('sorting does not mutate the input', () => {
    const input = [...tasks]
    sortRecords(input, [['points', true]])
    expect(ids(input)).toEqual(['a', 'b', 'c', 'd'])
  })
})
