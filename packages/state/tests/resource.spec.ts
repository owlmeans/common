import { describe, expect, test } from 'bun:test'
import { createStateResource, DEFAULT_ID } from '@owlmeans/state'
import type { StateModel } from '@owlmeans/state'

interface Task {
  id?: string
  title?: string
  status?: string
  points?: number
}

const seeded = async () => {
  const resource = createStateResource<Task>('tasks')
  await resource.create({ id: 'a', title: 'Alpha', status: 'open', points: 3 })
  await resource.create({ id: 'b', title: 'Beta', status: 'done', points: 8 })
  await resource.create({ id: 'c', title: 'Gamma', status: 'open', points: 1 })

  return resource
}

describe('@owlmeans/state — resource list surface', () => {
  // Every caller written before criteria existed spells `list()` and expects the whole store.
  // A server resource defaults to ten per page; inheriting that here would silently truncate
  // them, and nothing on the call site would say so.
  test('list() with no arguments returns everything, unpaged', async () => {
    const resource = await seeded()
    const { items } = await resource.list()
    expect(items.map(item => item.id)).toEqual(['a', 'b', 'c'])
  })

  test('list(criteria) filters and reports the true total', async () => {
    const resource = await seeded()
    const result = await resource.list({ status: 'open' })
    expect(result.items.map(item => item.id)).toEqual(['a', 'c'])
    expect(result.pager?.total).toBe(2)
  })

  test('list accepts the ListOptions form with a pager', async () => {
    const resource = await seeded()
    const result = await resource.list({
      criteria: { status: ['open', 'done'] },
      pager: { page: 0, size: 2, sort: [['points', true]] },
    })
    expect(result.items.map(item => item.id)).toEqual(['b', 'a'])
    expect(result.pager?.total).toBe(3)

    const second = await resource.list({
      criteria: { status: ['open', 'done'] },
      pager: { page: 1, size: 2, sort: [['points', true]] },
    })
    expect(second.items.map(item => item.id)).toEqual(['c'])
  })

  test('all() and match() answer without the envelope', async () => {
    const resource = await seeded()
    expect((await resource.all()).map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect((await resource.match({ status: 'open' })).map(item => item.id)).toEqual(['a', 'c'])
    expect((await resource.match()).map(item => item.id)).toEqual(['a', 'b', 'c'])
  })

  test('the pre-existing throws are untouched', async () => {
    const resource = await seeded()
    expect(resource.load('a', 'title')).rejects.toThrow()
    expect(resource.create({ id: 'a' })).rejects.toThrow()
  })
})

describe('@owlmeans/state — live query subscriptions', () => {
  test('a query subscriber is seeded with the current answer and follows writes', async () => {
    const resource = await seeded()
    const seen: string[][] = []
    const [unsubscribe, initial] = resource.subscribe({
      query: { status: 'open' },
      listener: models => { seen.push(models.map(model => model.record.id!)) },
    })

    expect(initial.map(model => model.record.id)).toEqual(['a', 'c'])

    // A record entering the set
    await resource.create({ id: 'd', title: 'Delta', status: 'open' })
    expect(seen.at(-1)).toEqual(['a', 'c', 'd'])

    // A record leaving the set through an update
    await resource.update({ id: 'a', status: 'done' })
    expect(seen.at(-1)).toEqual(['c', 'd'])

    // A record leaving the set through a delete
    await resource.delete('c')
    expect(seen.at(-1)).toEqual(['d'])

    unsubscribe()
    const before = seen.length
    await resource.create({ id: 'e', status: 'open' })
    expect(seen.length).toBe(before)
  })

  // The id path creates a placeholder so a screen has something to bind to before its record
  // arrives. A query has no such record to invent, and inventing one would put a blank row in
  // every list.
  test('a query subscription creates nothing', async () => {
    const resource = createStateResource<Task>('empty')
    const [, initial] = resource.subscribe({ query: { status: 'open' }, listener: () => { } })
    expect(initial).toEqual([])
    expect((await resource.all()).length).toBe(0)
  })

  test('an id subscription still creates its placeholder and still fires', async () => {
    const resource = await seeded()
    const seen: string[] = []
    resource.subscribe({
      id: 'zz',
      default: { title: 'placeholder' },
      listener: models => { seen.push(models[0]!.record.title!) },
    })
    expect((await resource.load('zz'))?.title).toBe('placeholder')

    await resource.update({ id: 'zz', title: 'real' })
    expect(seen.at(-1)).toBe('real')
  })

  test('id wins when a caller passes both', async () => {
    const resource = await seeded()
    const [, initial] = resource.subscribe({
      id: 'a',
      query: { status: 'done' },
      listener: () => { },
    })
    expect(initial.map(model => model.record.id)).toEqual(['a'])
  })

  test('a repeated plain query listener is refused, a _systemId one is deduped', async () => {
    const resource = await seeded()
    const listener = () => { }
    resource.subscribe({ query: { status: 'open' }, listener })
    expect(() => resource.subscribe({ query: { status: 'open' }, listener })).toThrow()

    const systemListener = () => { }
    const [, first] = resource.subscribe({ _systemId: 'r1', query: { status: 'open' }, listener: systemListener })
    const [, again] = resource.subscribe({ _systemId: 'r1', query: { status: 'open' }, listener: systemListener })
    expect(again.map(model => model.record.id)).toEqual(first.map(model => model.record.id))
  })

  test('DEFAULT_ID is still what an id-less model gets', async () => {
    const resource = createStateResource<Task>('single')
    const [, models] = resource.subscribe({ listener: () => { } })
    expect(models[0]!.record.id).toBe(DEFAULT_ID)
  })

  test('a model committed from a query result writes through', async () => {
    const resource = await seeded()
    let latest: StateModel<Task>[] = []
    resource.subscribe({ query: { status: 'open' }, listener: models => { latest = models } })

    const [first] = await Promise.resolve(latest.length > 0 ? latest : resource.subscribe({
      query: { status: 'open' }, listener: () => { },
    })[1])

    first!.update({ points: 42 })
    await Promise.resolve()
    expect((await resource.load('a'))?.points).toBe(42)
  })
})
