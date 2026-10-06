import { afterAll, describe, expect, test } from 'bun:test'
import { makeMongoResource } from '@owlmeans/mongo-resource'
import { UnknownRecordError, UnsupportedArgumentError } from '@owlmeans/resource'

import { gate, makeSuite } from './context.js'
import type { MongoResource, Note } from './context.js'

const noteSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    slug: { type: 'string', nullable: true }
  },
  required: ['title']
}

const suite = makeSuite('crud')
const it = gate.skip ? test.skip : test

/** One alias — and so one collection — per test, so the sets never interfere. */
const notes = async (alias: string): Promise<MongoResource<Note>> => {
  const resource = makeMongoResource<Note, MongoResource<Note>>(alias)
  resource.schema = noteSchema as never
  const { context } = await suite.boot({ resources: [resource] })

  return context.resource<MongoResource<Note>>(alias)
}

describe('@owlmeans/mongo — the resource contract', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'mongo gate closed', () => {})

    return
  }

  afterAll(async () => {
    await suite.teardown()
  })

  it('reads one record by id and by criteria', async () => {
    const res = await notes('crud-read')
    const note = await res.create({ title: 'first', slug: 'one' })
    expect(typeof note.id).toBe('string')

    expect((await res.get(note.id!)).title).toBe('first')
    /** Several fields at once, without listing and taking the first element. */
    expect((await res.get({ title: 'first', slug: 'one' })).id).toBe(note.id!)
    expect(await res.load({ slug: 'nope' })).toBeNull()
  })

  it('answers an id that is not a mongo id rather than throwing a driver error', async () => {
    const res = await notes('crud-badid')

    expect(await res.load('not-an-object-id')).toBeNull()
    await expect(res.get('not-an-object-id')).rejects.toThrow(UnknownRecordError)
  })

  it('pages and sorts, and always reports the total', async () => {
    const res = await notes('crud-page')
    for (const title of ['c', 'a', 'd', 'b']) {
      await res.create({ title })
    }

    const first = await res.list({}, { size: 2, sort: ['title'] })
    expect(first.items.map(note => note.title)).toEqual(['a', 'b'])
    expect(first.total).toBe(4)
    expect(first.page).toBe(0)
    expect(first.size).toBe(2)

    const second = await res.list({}, { page: 1, size: 2, sort: ['title'] })
    expect(second.items.map(note => note.title)).toEqual(['c', 'd'])
    expect(second.total).toBe(4)

    const newest = await res.list(undefined, { size: 1, sort: [{ field: 'title', order: 'desc' }] })
    expect(newest.items.map(note => note.title)).toEqual(['d'])

    /** `size: 0` is the explicit ask for the whole result set. */
    const all = await res.list({}, { size: 0, sort: ['title'] })
    expect(all.items).toHaveLength(4)
    expect(all.total).toBe(4)
    expect(all.size).toBeUndefined()
  })

  it('counts without reading the records', async () => {
    const res = await notes('crud-count')
    await res.create({ title: 'x', slug: 'keep' })
    await res.create({ title: 'y', slug: 'keep' })
    await res.create({ title: 'z', slug: 'drop' })

    expect(await res.count()).toBe(3)
    expect(await res.count({ slug: 'keep' })).toBe(2)
    expect(await res.count({ slug: 'absent' })).toBe(0)
  })

  it('answers the shared operators the same way the other stores do', async () => {
    const res = await notes('crud-ops')
    await res.create({ title: 'Alpha', slug: 'a-1' })
    await res.create({ title: 'beta', slug: 'b-2' })
    await res.create({ title: 'gamma' })

    expect((await res.list({ title: { $ilike: 'al%' } })).items.map(note => note.title))
      .toEqual(['Alpha'])
    expect((await res.list({ slug: { $startsWith: 'b-' } })).items.map(note => note.title))
      .toEqual(['beta'])
    expect((await res.list({ slug: { $null: true } })).items.map(note => note.title))
      .toEqual(['gamma'])
    expect((await res.list({ title: ['Alpha', 'beta'] })).total).toBe(2)
    expect((await res.list({ $or: [{ title: 'Alpha' }, { slug: 'b-2' }] })).total).toBe(2)
    expect((await res.list({ $not: { title: 'gamma' } })).total).toBe(2)
  })

  it('purges by criteria and refuses to empty the collection', async () => {
    const res = await notes('crud-purge')
    await res.create({ title: 'x', slug: 'drop' })
    await res.create({ title: 'y', slug: 'drop' })
    await res.create({ title: 'z', slug: 'keep' })

    /** An empty criteria object would delete everything — one call replacing a page loop. */
    await expect(res.purge({})).rejects.toThrow(UnsupportedArgumentError)

    expect(await res.purge({ slug: 'drop' })).toBe(2)
    expect(await res.count()).toBe(1)
  })

  it('takes a record out and hands it back, where delete tolerates absence', async () => {
    const res = await notes('crud-take')
    const note = await res.create({ title: 'once' })

    expect((await res.take(note.id!)).title).toBe('once')
    await expect(res.take(note.id!)).rejects.toThrow(UnknownRecordError)
    expect(await res.delete(note.id!)).toBeNull()
  })

  it('creates without an id, replaces with one', async () => {
    const res = await notes('crud-save')
    const created = await res.save({ title: 'draft', slug: 'kept' })
    expect(typeof created.id).toBe('string')

    const replaced = await res.save({ id: created.id, title: 'final' })
    expect(replaced.id).toBe(created.id!)
    expect(replaced.title).toBe('final')
    /** A replace, not a patch — the field the new record omits is gone from the document. */
    expect(replaced.slug).toBeUndefined()
    expect(await res.count()).toBe(1)
  })

  it('refuses an expiry it cannot honour', async () => {
    const res = await notes('crud-ttl')

    await expect(res.create({ title: 'ephemeral' }, { ttl: 60 })).rejects
      .toThrow(UnsupportedArgumentError)
  })
})
