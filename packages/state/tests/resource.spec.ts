import { describe, expect, test } from 'bun:test'
import { createStateResource, StateConfigError } from '@owlmeans/state'
import type { StateEvent, StateModel } from '@owlmeans/state'
import type { ResourceRecord } from '@owlmeans/resource'

interface Task extends ResourceRecord {
  title?: string
  status?: string
  points?: number
}

interface Session extends ResourceRecord {
  token?: string
  user?: string
}

interface Doc extends ResourceRecord {
  key?: string
  body?: string
}

const seeded = async () => {
  const resource = createStateResource<Task>('tasks')
  await resource.create({ id: 'a', title: 'Alpha', status: 'open', points: 3 })
  await resource.create({ id: 'b', title: 'Beta', status: 'done', points: 8 })
  await resource.create({ id: 'c', title: 'Gamma', status: 'open', points: 1 })

  return resource
}

describe('@owlmeans/state — reads', () => {
  test('list() is unpaged and always reports the total', async () => {
    const resource = await seeded()
    const result = await resource.list()
    expect(result.items.map(item => item.id)).toEqual(['a', 'b', 'c'])
    expect(result.total).toBe(3)
  })

  test('list(where, opts) filters, sorts and pages', async () => {
    const resource = await seeded()
    const first = await resource.list(
      { status: ['open', 'done'] },
      { page: 0, size: 2, sort: [{ field: 'points', order: 'desc' }] }
    )
    expect(first.items.map(item => item.id)).toEqual(['b', 'a'])
    expect(first.total).toBe(3)

    const second = await resource.list(
      { status: ['open', 'done'] },
      { page: 1, size: 2, sort: [{ field: 'points', order: 'desc' }] }
    )
    expect(second.items.map(item => item.id)).toEqual(['c'])
  })

  // The store is unpaged, so a page number alone has no page size to count from. Answering with
  // everything would silently ignore what the caller asked for.
  test('a page without a size is refused', async () => {
    const resource = await seeded()
    await expect(resource.list(undefined, { page: 1 })).rejects.toThrow()
  })

  test('count() answers without carrying the records', async () => {
    const resource = await seeded()
    expect(await resource.count()).toBe(3)
    expect(await resource.count({ status: 'open' })).toBe(2)
  })

  test('one record by id or by criteria', async () => {
    const resource = await seeded()
    expect((await resource.load('a'))?.title).toBe('Alpha')
    expect((await resource.load({ status: 'done' }))?.id).toBe('b')
    expect((await resource.load({ status: 'missing' }))).toBeNull()
    expect((await resource.load('zz'))).toBeNull()

    expect((await resource.get({ title: 'Gamma' })).id).toBe('c')
    await expect(resource.get('zz')).rejects.toThrow()
    await expect(resource.get({ status: 'missing' })).rejects.toThrow()
  })

  test('a sort picks which of several matches comes first', async () => {
    const resource = await seeded()
    const lowest = await resource.get({ status: 'open' }, { sort: ['points'] })
    expect(lowest.id).toBe('c')
  })
})

describe('@owlmeans/state — writes', () => {
  test('create refuses a record that is already there', async () => {
    const resource = await seeded()
    await expect(resource.create({ id: 'a' })).rejects.toThrow()
  })

  test('update replaces the record and refuses an unknown one', async () => {
    const resource = await seeded()
    await resource.update({ id: 'a', title: 'Renamed' })
    const record = await resource.get('a')
    expect(record.title).toBe('Renamed')
    expect(record.status).toBeUndefined()

    await expect(resource.update({ id: 'zz' })).rejects.toThrow()
  })

  test('save creates or replaces', async () => {
    const resource = await seeded()
    await resource.save({ id: 'd', title: 'Delta' })
    await resource.save({ id: 'a', title: 'Alpha again' })
    expect(await resource.count()).toBe(4)
    expect((await resource.get('a')).title).toBe('Alpha again')
  })

  // Nothing here mints ids, so a record without one is misfiled rather than new — inventing a key
  // would put a record in the store that no screen can ever address again.
  test('a write without an id is a configuration error', async () => {
    const resource = await seeded()
    await expect(resource.save({ title: 'nameless' })).rejects.toThrow(StateConfigError)
  })

  test('the store keeps nothing that expires, so a ttl is refused', async () => {
    const resource = await seeded()
    await expect(resource.save({ id: 'a' }, { ttl: 60 })).rejects.toThrow()
  })

  test('delete answers with null, take throws', async () => {
    const resource = await seeded()
    expect((await resource.delete('a'))?.id).toBe('a')
    expect(await resource.delete('a')).toBeNull()

    expect((await resource.take('b')).id).toBe('b')
    await expect(resource.take('b')).rejects.toThrow()
  })

  test('purge removes the matching records and refuses to empty the store', async () => {
    const resource = await seeded()
    await expect(resource.purge({})).rejects.toThrow()
    expect(await resource.purge({ status: 'open' })).toBe(2)
    expect((await resource.list()).items.map(item => item.id)).toEqual(['b'])
  })

  test('replace makes the store agree with an authoritative list', async () => {
    const resource = await seeded()
    await resource.replace([
      { id: 'a', title: 'Alpha', status: 'done' },
      { id: 'z', title: 'Zeta', status: 'open' }
    ])
    const { items } = await resource.list()
    expect(items.map(item => item.id)).toEqual(['a', 'z'])
    expect((await resource.get('a')).status).toBe('done')
  })

  test('clear drops everything', async () => {
    const resource = await seeded()
    await resource.clear()
    expect(await resource.count()).toBe(0)
  })
})

describe('@owlmeans/state — watching one record', () => {
  // The whole point of the model: a subscription READS the store, it does not seed it. A screen
  // bound to an id that has not arrived must not put a blank row into every list reading the same
  // resource.
  test('an id subscription creates NOTHING', async () => {
    const resource = await seeded()
    const seen: StateModel<Task>[] = []
    const stop = resource.watch('zz', model => { seen.push(model) })

    expect(await resource.count()).toBe(3)
    expect(await resource.load('zz')).toBeNull()
    expect(seen).toHaveLength(1)
    expect(seen[0]!.empty).toBe(true)
    expect(seen[0]!.id).toBe('zz')

    stop()
  })

  test('an empty model shows the configured default and stays out of the store', async () => {
    const resource = createStateResource<Task>('drafts', {
      default: () => ({ title: 'Untitled', status: 'draft' })
    })
    let model!: StateModel<Task>
    const stop = resource.watch('new', current => { model = current })

    expect(model.empty).toBe(true)
    expect(model.record.title).toBe('Untitled')
    expect(await resource.count()).toBe(0)

    stop()
  })

  test('the listener is seeded synchronously and follows the record', async () => {
    const resource = await seeded()
    const titles: Array<string | undefined> = []
    const stop = resource.watch('a', model => { titles.push(model.record.title) })

    expect(titles).toEqual(['Alpha'])

    await resource.save({ id: 'a', title: 'Renamed' })
    expect(titles.at(-1)).toBe('Renamed')

    await resource.delete('a')
    expect(titles.at(-1)).toBeUndefined()

    stop()
    await resource.save({ id: 'a', title: 'Back' })
    expect(titles).toHaveLength(3)
  })

  test('a model written through stops being empty', async () => {
    const resource = await seeded()
    let model!: StateModel<Task>
    const stop = resource.watch('zz', current => { model = current })

    const written = await model.update({ title: 'Zulu' })
    expect(written.id).toBe('zz')
    expect((await resource.get('zz')).title).toBe('Zulu')

    // The listener has been handed a fresh model by now; the one written through knows it landed.
    expect(model.empty).toBe(false)

    await model.clear()
    expect(await resource.load('zz')).toBeNull()

    stop()
  })

  /**
   * A screen binds to `watch(project.id)` while the project is still loading, so an absent id is
   * a rendering state and must not take the component tree down with it. Reading with no id is a
   * different question — there the caller has lost track of which record it meant.
   */
  test('watching with no id reports empty rather than throwing', async () => {
    const resource = await seeded()
    let model!: StateModel<Session>
    const stop = resource.watch(undefined, current => { model = current })

    expect(model.empty).toBe(true)
    expect(model.id).toBeUndefined()

    stop()
  })

  test('the empty model is one reference, so a subscriber sees no change', async () => {
    const resource = await seeded()
    const seen: StateModel<Session>[] = []
    const first = resource.watch(undefined, current => { seen.push(current) })
    const second = resource.watch(undefined, current => { seen.push(current) })

    expect(seen).toHaveLength(2)
    expect(seen[0]).toBe(seen[1])

    first()
    second()
  })

  test('writing through the empty model is refused', async () => {
    const resource = await seeded()
    let model!: StateModel<Session>
    const stop = resource.watch(undefined, current => { model = current })

    await expect(model.update({ token: 'x' } as Partial<Session>)).rejects.toThrow(StateConfigError)

    stop()
  })

  /**
   * The reason the empty model exists at all: the store it stands in for must be untouched. The
   * placeholder record this replaced put a blank row into every list reading the same store.
   */
  test('watching with no id writes nothing into the store', async () => {
    const resource = await seeded()
    const before = await resource.list()
    const stop = resource.watch(undefined, () => { })
    const after = await resource.list()

    expect(after.total).toBe(before.total)
    expect(after.items.some(item => item.id == null)).toBe(false)

    stop()
  })
})

describe('@owlmeans/state — a single resource', () => {
  test('one slot, addressed without an id', async () => {
    const resource = createStateResource<Session>('session', { single: true })
    let model!: StateModel<Session>
    const stop = resource.watch(undefined, current => { model = current })

    expect(model.empty).toBe(true)

    await resource.save({ token: 'first', user: 'ann' })
    expect(model.empty).toBe(false)
    expect(model.record.token).toBe('first')

    await resource.save({ token: 'second', user: 'bob' })
    expect(await resource.count()).toBe(1)
    expect(model.record.user).toBe('bob')

    await model.clear()
    expect(await resource.count()).toBe(0)

    stop()
  })

  test('the one record still answers only to its own id', async () => {
    const resource = createStateResource<Session>('session-id', { single: true })
    await resource.save({ id: 'sid', token: 'a' })
    expect((await resource.load('sid'))?.token).toBe('a')
    expect(await resource.load('other')).toBeNull()
  })
})

describe('@owlmeans/state — a custom id field', () => {
  test('records are keyed by the configured field', async () => {
    const resource = createStateResource<Doc>('docs', { id: 'key' })
    await resource.save({ key: 'intro', body: 'hello' })
    await resource.save({ key: 'outro', body: 'bye' })

    expect((await resource.get('intro')).body).toBe('hello')
    expect(await resource.count()).toBe(2)
    await expect(resource.save({ body: 'orphan' })).rejects.toThrow(StateConfigError)
  })
})

describe('@owlmeans/state — live queries', () => {
  test('a query subscriber is seeded and follows every write that changes the answer', async () => {
    const resource = await seeded()
    const seen: string[][] = []
    const stop = resource.query({ status: 'open' }, models => {
      seen.push(models.map(model => model.record.id!))
    })

    expect(seen.at(-1)).toEqual(['a', 'c'])

    await resource.create({ id: 'd', title: 'Delta', status: 'open' })
    expect(seen.at(-1)).toEqual(['a', 'c', 'd'])

    await resource.save({ id: 'a', status: 'done' })
    expect(seen.at(-1)).toEqual(['c', 'd'])

    await resource.delete('c')
    expect(seen.at(-1)).toEqual(['d'])

    stop()
    await resource.create({ id: 'e', status: 'open' })
    expect(seen.at(-1)).toEqual(['d'])
  })

  test('a query subscription creates nothing', async () => {
    const resource = createStateResource<Task>('empty')
    const stop = resource.query({ status: 'open' }, () => { })
    expect(await resource.count()).toBe(0)
    stop()
  })

  test('an absent query matches everything and takes the sort', async () => {
    const resource = await seeded()
    let ids: string[] = []
    const stop = resource.query(undefined, models => {
      ids = models.map(model => model.record.id!)
    }, { sort: [{ field: 'points', order: 'desc' }] })

    expect(ids).toEqual(['b', 'a', 'c'])
    stop()
  })

  // A write that leaves the answer alone must not re-render the screens reading it.
  test('an unchanged answer is not announced again', async () => {
    const resource = await seeded()
    let calls = 0
    const stop = resource.query({ status: 'open' }, () => { calls += 1 })
    expect(calls).toBe(1)

    await resource.save({ id: 'b', status: 'done', title: 'Beta reworded' })
    expect(calls).toBe(1)

    await resource.save({ id: 'b', status: 'open' })
    expect(calls).toBe(2)

    stop()
  })
})

describe('@owlmeans/state — the change stream', () => {
  test('every write announces itself', async () => {
    const resource = await seeded()
    const events: StateEvent<Task>[] = []
    const stop = await resource.subscribe(event => { events.push(event) })

    await resource.save({ id: 'd', title: 'Delta' })
    expect(events.at(-1)?.type).toBe('set')
    expect(events.at(-1)?.records.map(record => record.id)).toEqual(['d'])

    await resource.purge({ status: 'open' })
    expect(events.at(-1)?.type).toBe('remove')
    expect(events.at(-1)?.records.map(record => record.id)).toEqual(['a', 'c'])

    await stop()
    await resource.save({ id: 'e' })
    expect(events).toHaveLength(2)
  })

  test('a once subscriber hears one event, and a channel keeps its traffic apart', async () => {
    const resource = await seeded()
    let once = 0
    await resource.subscribe(() => { once += 1 }, { once: true })

    const aside: StateEvent<Task>[] = []
    const stop = await resource.subscribe(event => { aside.push(event) }, { channel: 'aside' })

    await resource.save({ id: 'd' })
    await resource.save({ id: 'f' })
    expect(once).toBe(1)
    expect(aside).toHaveLength(0)

    await resource.publish({ type: 'set', records: [{ id: 'd' }] }, 'aside')
    expect(aside).toHaveLength(1)

    await stop()
  })
})
