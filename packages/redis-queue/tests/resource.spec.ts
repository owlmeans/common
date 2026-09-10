import { afterAll, describe, expect, test } from 'bun:test'
import { JobState } from '@owlmeans/queue'
import { gate, makeSuite } from './context.js'

/**
 * The resource half of the driver, with nothing consuming.
 *
 * Every assertion here is about a queue read as records: what an enqueue returns, what a read by
 * id and by criteria answer, what a listing counts, and what a cancel takes away. Nothing listens,
 * so every job stays waiting and the state the broker reports is the state the test put it in.
 */
describe('@owlmeans/redis-queue — queue as a resource', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'redis gate closed', () => { })
    return
  }

  const suite = makeSuite('resource')

  /** A queue per test that enumerates: a walk sees every job of the queue it belongs to. */
  const boot = async () => await suite.boot({
    queues: [
      { name: 'basics', jobs: ['alpha', 'beta'] },
      { name: 'listing', jobs: ['alpha', 'beta'] },
      { name: 'counting', jobs: ['alpha', 'beta'] },
      { name: 'purging', jobs: ['alpha', 'beta'] },
      { name: 'cancelling', jobs: ['alpha', 'beta'] },
    ]
  })

  afterAll(async () => {
    await suite.teardown()
  })

  test('create enqueues a declared job and answers with its record', async () => {
    const { jobs } = await boot()
    const queue = jobs<{ value: string }>('basics')

    const record = await queue.create({ name: 'alpha', data: { value: 'first' } })

    expect(record.id).toBeString()
    expect(record).toMatchObject({ queue: 'basics', name: 'alpha', state: JobState.Waiting })
    expect(record.data).toEqual({ value: 'first' })
  })

  test('create refuses a job name the queue does not declare', async () => {
    const { jobs } = await boot()

    await expect(
      jobs('basics').create({ name: 'undeclared', data: {} })
    ).rejects.toThrow(/unknown-job-name/)
  })

  test('create refuses a queue nothing declares', async () => {
    const { jobs } = await boot()

    expect(() => jobs('never-declared')).toThrow(/unknown-queue/)
  })

  test('a caller chosen id makes the enqueue repeatable', async () => {
    const { jobs } = await boot()
    const queue = jobs<{ value: string }>('basics')

    const first = await queue.create({ name: 'alpha', data: { value: 'once' }, opts: { id: 'admitted' } })
    const again = await queue.create({ name: 'alpha', data: { value: 'twice' }, opts: { id: 'admitted' } })

    expect(first.id).toBe('admitted')
    expect(again.id).toBe('admitted')
    expect((await queue.get('admitted')).data).toEqual({ value: 'once' })
  })

  test('get throws for an id that is not there, load answers null', async () => {
    const { jobs } = await boot()
    const queue = jobs('basics')

    await expect(queue.get('never-enqueued')).rejects.toThrow(/unknown-job/)
    expect(await queue.load('never-enqueued')).toBeNull()
  })

  test('load takes criteria, not only an id', async () => {
    const { jobs } = await boot()
    const queue = jobs<{ value: string }>('basics')
    await queue.create({ name: 'beta', data: { value: 'needle' }, opts: { id: 'by-criteria' } })

    expect(await queue.load({ 'data.value': 'needle' })).toMatchObject({ id: 'by-criteria' })
    expect(await queue.load({ 'data.value': 'absent' })).toBeNull()
  })

  test('list returns every job with a total, and filters on criteria', async () => {
    const { jobs } = await boot()
    const queue = jobs<{ index: number }>('listing')
    for (let index = 0; index < 4; index++) {
      await queue.create({ name: index % 2 === 0 ? 'alpha' : 'beta', data: { index } })
    }

    const all = await queue.list()
    expect(all.total).toBe(4)
    expect(all.items).toHaveLength(4)

    const alphas = await queue.list({ name: 'alpha' })
    expect(alphas.total).toBe(2)
    expect(alphas.items.every(item => item.name === 'alpha')).toBeTrue()
  })

  test('list sorts and pages the way every other backend does', async () => {
    const { jobs } = await boot()
    const queue = jobs<{ index: number }>('listing')

    const sorted = await queue.list(undefined, { sort: [{ field: 'data.index', order: 'desc' }] })
    expect(sorted.items.map(item => item.data.index)).toEqual([3, 2, 1, 0])

    const paged = await queue.list(undefined, {
      sort: [{ field: 'data.index' }], page: 1, size: 2
    })
    expect(paged.items.map(item => item.data.index)).toEqual([2, 3])
    expect(paged.total).toBe(4)
  })

  test('a page without a size is a caller error, not an implied window', async () => {
    const { jobs } = await boot()

    await expect(jobs('listing').list(undefined, { page: 1 })).rejects.toThrow(/page-without-size/)
  })

  test('count answers the whole queue and a filtered slice of it', async () => {
    const { jobs } = await boot()
    const queue = jobs<{ index: number }>('counting')
    for (let index = 0; index < 3; index++) {
      await queue.create({ name: index === 0 ? 'alpha' : 'beta', data: { index } })
    }

    expect(await queue.count()).toBe(3)
    expect(await queue.count({ name: 'beta' })).toBe(2)
    expect((await queue.counts())[JobState.Waiting]).toBe(3)
  })

  test('delete cancels and hands back what it removed', async () => {
    const { jobs } = await boot()
    const queue = jobs<{ value: string }>('cancelling')
    const record = await queue.create({ name: 'alpha', data: { value: 'cancel-me' } })

    expect(await queue.delete(record.id as string)).toMatchObject({ name: 'alpha' })
    expect(await queue.load(record.id as string)).toBeNull()
    expect(await queue.delete('never-enqueued')).toBeNull()
  })

  test('take is the same removal where absence is an error', async () => {
    const { jobs } = await boot()
    const queue = jobs<{ value: string }>('cancelling')
    const record = await queue.create({ name: 'beta', data: { value: 'taken' } })

    expect(await queue.take(record.id as string)).toMatchObject({ name: 'beta' })
    await expect(queue.take('never-enqueued')).rejects.toThrow(/unknown-job/)
  })

  test('update rewrites the payload a processor has not read yet', async () => {
    const { jobs } = await boot()
    const queue = jobs<{ value: string }>('basics')
    const record = await queue.create({ name: 'alpha', data: { value: 'before' } })

    const updated = await queue.update({ id: record.id, data: { value: 'after' } })
    expect(updated.data).toEqual({ value: 'after' })
    expect((await queue.get(record.id as string)).data).toEqual({ value: 'after' })
  })

  test('save enqueues an unknown id and rewrites a known one', async () => {
    const { jobs } = await boot()
    const queue = jobs<{ value: string }>('basics')

    const created = await queue.save({ id: 'saved', name: 'alpha', data: { value: 'new' } })
    expect(created.id).toBe('saved')

    const replaced = await queue.save({ id: 'saved', name: 'alpha', data: { value: 'again' } })
    expect(replaced.data).toEqual({ value: 'again' })
  })

  test('purge removes what the criteria matches and refuses an empty one', async () => {
    const { jobs } = await boot()
    const queue = jobs<{ index: number }>('purging')
    for (let index = 0; index < 4; index++) {
      await queue.create({ name: index < 3 ? 'alpha' : 'beta', data: { index } })
    }

    await expect(queue.purge({})).rejects.toThrow(/empty-criteria/)
    expect(await queue.purge({ name: 'alpha' })).toBe(3)
    expect(await queue.count()).toBe(1)
  })
})
