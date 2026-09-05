import { afterAll, describe, expect, test } from 'bun:test'
import { gate, makeSuite } from './context.js'

/**
 * The criteria surface.
 *
 * Redis has no index, so anything that is not a bare id is a SCAN of the resource's own namespace
 * evaluated in memory. These assert what that walk owes the caller: criteria reads, an unpaged
 * default, the window that was actually asked for, a total that always counts every match, and a
 * purge that refuses to empty the namespace on an unset filter.
 */
describe('@owlmeans/redis — resource queries', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'redis gate closed', () => { })
    return
  }

  const suite = makeSuite('query')

  afterAll(async () => {
    await suite.teardown()
  })

  /** `rec-0` … `rec-<count-1>`, alternating `even` / `odd`, in a namespace of their own. */
  const seed = async (alias: string, count: number) => {
    const { resource } = await suite.boot(alias)
    for (let index = 0; index < count; index++) {
      await resource.create({ id: `rec-${index}`, value: index % 2 === 0 ? 'even' : 'odd' })
    }

    return resource
  }

  test('load takes criteria, not only an id', async () => {
    const resource = await seed('q-load', 0)
    await resource.create({ id: 'one', value: 'needle' })
    await resource.create({ id: 'two', value: 'hay' })

    expect(await resource.load({ value: 'needle' })).toMatchObject({ id: 'one' })
    expect(await resource.load({ value: 'absent' })).toBeNull()
  })

  test('get throws when nothing matches the criteria', async () => {
    const resource = await seed('q-get', 0)

    await expect(resource.get({ value: 'absent' })).rejects.toThrow()
  })

  test('list returns every match when no size is asked for', async () => {
    const resource = await seed('q-unpaged', 5)

    const result = await resource.list()

    expect(result.items).toHaveLength(5)
    expect(result.total).toBe(5)
  })

  test('list returns the page it was asked for, not the list minus that page', async () => {
    const resource = await seed('q-paged', 5)

    const result = await resource.list({}, { page: 1, size: 2, sort: ['id'] })

    expect(result.items.map(item => item.id)).toEqual(['rec-2', 'rec-3'])
    expect(result.total).toBe(5)
  })

  test('a page without a size is a caller error', async () => {
    const resource = await seed('q-page-only', 1)

    await expect(resource.list({}, { page: 1 })).rejects.toThrow()
  })

  test('count answers the match count', async () => {
    const resource = await seed('q-count', 5)

    expect(await resource.count()).toBe(5)
    expect(await resource.count({ value: 'even' })).toBe(3)
  })

  test('purge deletes every match and refuses empty criteria', async () => {
    const resource = await seed('q-purge', 5)

    expect(await resource.purge({ value: 'odd' })).toBe(2)
    expect(await resource.count()).toBe(3)
    await expect(resource.purge({})).rejects.toThrow()
  })

  test('update replaces the record rather than merging into it', async () => {
    const resource = await seed('q-update', 0)
    await resource.create({ id: 'replaced', value: 'before' })

    await resource.update({ id: 'replaced' })

    expect(await resource.load('replaced')).toEqual({ id: 'replaced' })
  })

  test('update throws for an id that was never created', async () => {
    const resource = await seed('q-missing', 0)

    await expect(resource.update({ id: 'never-created' })).rejects.toThrow()
  })

  test('save creates a record that carries no id', async () => {
    const resource = await seed('q-save', 0)

    const saved = await resource.save({ value: 'fresh' })

    expect(typeof saved.id).toBe('string')
    expect(await resource.load(saved.id)).toMatchObject({ value: 'fresh' })
  })
})
