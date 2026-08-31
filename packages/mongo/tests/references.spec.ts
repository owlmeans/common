import { afterAll, describe, expect, test } from 'bun:test'
import { makeMongoResource, resetDeclarations } from '@owlmeans/mongo-resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import { MisshapedRecord } from '@owlmeans/resource'
import type { ResourceRecord } from '@owlmeans/resource'
import { ObjectId } from 'mongodb'

import { gate, ledgerOf, makeSuite, raw } from './context.js'
import type { MongoDbService } from './context.js'

interface Owner extends ResourceRecord {
  id?: string
  title: string
}

interface Item extends ResourceRecord {
  id?: string
  title: string
  ownerId?: string | null
  ownerIds?: string[] | null
  key?: string
}

/**
 * Mirrors the real consumers: `profile.userId` lives on a schema-less resource,
 * viable's `projectId` fields live under AJV schemas. Both shapes are exercised.
 */
const itemSchema = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    ownerId: { type: 'string', nullable: true },
    ownerIds: { type: 'array', items: { type: 'string' }, nullable: true },
    key: { type: 'string', nullable: true }
  },
  required: ['title']
}

interface Built {
  alias: string
  schema?: unknown
  declare?: (resource: MongoResource<Item>) => void
}

const suite = makeSuite('refs')
const it = gate.skip ? test.skip : test

const build = (spec: Built): MongoResource<Item> => {
  const resource = makeMongoResource<Item, MongoResource<Item>>(spec.alias)
  if (spec.schema != null) {
    resource.schema = spec.schema as never
  }
  spec.declare?.(resource)

  return resource
}

const boot = async (...specs: Built[]) => await suite.boot({ resources: specs.map(build) })

describe('@owlmeans/mongo — ObjectId references', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'mongo gate closed', () => {})

    return
  }

  afterAll(async () => {
    await suite.teardown()
  })

  it('stores a declared reference as ObjectId and hands back strings', async () => {
    const { context } = await boot(
      { alias: 'ref-owner' },
      { alias: 'ref-item', schema: itemSchema, declare: r => r.reference('ownerId', 'ref-owner') }
    )

    const owners = context.resource<MongoResource<Owner>>('ref-owner')
    const items = context.resource<MongoResource<Item>>('ref-item')

    const owner = await owners.create({ title: 'owner' })
    const item = await items.create({ title: 'item', ownerId: owner.id })

    /** The record round-trips as strings — the API contract is untouched. */
    expect(item.ownerId).toBe(owner.id!)
    expect(typeof item.ownerId).toBe('string')

    /** The document stores an ObjectId — that's the whole point. */
    const stored = await raw(async client =>
      await client.db(suite.database).collection('ref-item').findOne({ _id: new ObjectId(item.id!) }))
    expect(stored?.ownerId).toBeInstanceOf(ObjectId)
    expect((stored?.ownerId as ObjectId).toString()).toBe(owner.id!)
  })

  it('finds records through string criteria against the converted field', async () => {
    const { context } = await boot(
      { alias: 'ref-owner' },
      { alias: 'ref-item', schema: itemSchema, declare: r => r.reference('ownerId', 'ref-owner') }
    )
    const owners = context.resource<MongoResource<Owner>>('ref-owner')
    const items = context.resource<MongoResource<Item>>('ref-item')

    const owner = await owners.create({ title: 'queried' })
    const other = await owners.create({ title: 'other' })
    await items.create({ title: 'a', ownerId: owner.id })
    await items.create({ title: 'b', ownerId: other.id })

    const listed = await items.list({ ownerId: owner.id! })
    expect(listed.items.map(i => i.title)).toEqual(['a'])
    expect(listed.items[0].ownerId).toBe(owner.id!)

    const viaIn = await items.list({ ownerId: { $in: [owner.id!, other.id!] } } as never)
    expect(viaIn.items).toHaveLength(2)

    /** `id` criteria address `_id` — documents never store an `id` field. */
    const byId = await items.list({ id: listed.items[0].id! })
    expect(byId.items).toHaveLength(1)

    /** A non-id value probes tolerantly: matches nothing rather than throwing. */
    const none = await items.list({ ownerId: 'ext:not-an-id' })
    expect(none.items).toHaveLength(0)

    const loaded = await items.load(owner.id!, 'ownerId')
    expect(loaded?.title).toBe('a')
  })

  it('refuses to store a non-id in a declared reference', async () => {
    const { context } = await boot(
      { alias: 'ref-item', schema: itemSchema, declare: r => r.reference('ownerId', 'ref-owner') }
    )
    const items = context.resource<MongoResource<Item>>('ref-item')

    await expect(items.create({ title: 'bad', ownerId: 'business-key' })).rejects.toThrow(MisshapedRecord)
  })

  it('converts arrays of ids elementwise', async () => {
    const { context } = await boot(
      { alias: 'ref-owner' },
      { alias: 'ref-multi', schema: itemSchema, declare: r => r.reference('ownerIds', 'ref-owner') }
    )
    const owners = context.resource<MongoResource<Owner>>('ref-owner')
    const items = context.resource<MongoResource<Item>>('ref-multi')

    const first = await owners.create({ title: 'first' })
    const second = await owners.create({ title: 'second' })
    const item = await items.create({ title: 'multi', ownerIds: [first.id!, second.id!] })
    expect(item.ownerIds).toEqual([first.id!, second.id!])

    const stored = await raw(async client =>
      await client.db(suite.database).collection('ref-multi').findOne({ _id: new ObjectId(item.id!) }))
    expect((stored?.ownerIds as unknown[]).every(v => v instanceof ObjectId)).toBe(true)

    /** Multikey criteria hit the converted elements. */
    const listed = await items.list({ ownerIds: second.id! })
    expect(listed.items.map(i => i.title)).toEqual(['multi'])
  })

  it('indexes a declared reference automatically, unless the resource already does', async () => {
    const { mongo } = await boot(
      { alias: 'ref-item', schema: itemSchema, declare: r => r.reference('ownerId', 'ref-owner') },
      {
        alias: 'ref-owned', schema: itemSchema,
        declare: r => {
          r.index('ownerId', { ownerId: 1 })
          r.reference('ownerId', 'ref-owner')
        }
      }
    )
    const db = await mongo.db()

    const auto = await db.collection('ref-item').indexes()
    expect(auto.some(index => index.name === 'ref_ownerId')).toBe(true)

    /** Same key pattern already declared — the automatic one steps aside. */
    const manual = await db.collection('ref-owned').indexes()
    expect(manual.some(index => index.name === 'ownerId')).toBe(true)
    expect(manual.some(index => index.name === 'ref_ownerId')).toBe(false)
  })

  it('migrates pre-existing string ids and records it in the ledger', async () => {
    const legacyOwner = new ObjectId().toString()
    const { mongo } = await boot({ alias: 'ref-legacy', schema: itemSchema })
    const db = await mongo.db()
    await db.collection('ref-legacy').insertMany([
      { title: 'legacy-a', ownerId: legacyOwner },
      { title: 'legacy-b', ownerId: 'ext:key' },
      { title: 'legacy-c', ownerId: null }
    ])

    const { context } = await boot(
      { alias: 'ref-legacy', schema: itemSchema, declare: r => r.reference('ownerId', 'ref-owner') }
    )

    const rows = await ledgerOf(mongo, 'ref-legacy')
    expect(rows.map(row => row.name)).toEqual(['$ref:ownerId@1'])
    expect(rows[0].baseline).toBe(false)
    expect(rows[0].completedAt).not.toBeNull()

    const docs = await db.collection('ref-legacy').find({}).sort({ title: 1 }).toArray()
    expect(docs[0].ownerId).toBeInstanceOf(ObjectId)
    /** Not a mongo id — left exactly as it was, loudly convertible by hand if ever needed. */
    expect(docs[1].ownerId).toBe('ext:key')
    expect(docs[2].ownerId).toBeNull()

    /** And the migrated value flows back out as the same string. */
    const items = context.resource<MongoResource<Item>>('ref-legacy')
    const migrated = await items.list({ ownerId: legacyOwner })
    expect(migrated.items.map(i => i.title)).toEqual(['legacy-a'])
  })

  it('baselines the reference migration on a fresh collection', async () => {
    const { mongo } = await boot(
      { alias: 'ref-fresh', schema: itemSchema, declare: r => r.reference('ownerId', 'ref-owner') }
    )

    const rows = await ledgerOf(mongo, 'ref-fresh')
    expect(rows.map(row => row.name)).toEqual(['$ref:ownerId@1'])
    expect(rows[0].baseline).toBe(true)
  })

  it('repairs strings the ledger never saw — the double check', async () => {
    const spec: Built = {
      alias: 'ref-drift', schema: itemSchema, declare: r => r.reference('ownerId', 'ref-owner')
    }
    const { mongo } = await boot(spec)
    const db = await mongo.db()

    /** A legacy writer sneaks a string in after the migration was recorded as applied. */
    const sneaked = new ObjectId().toString()
    await db.collection('ref-drift').insertOne(
      { title: 'sneaked', ownerId: sneaked } as never,
      { bypassDocumentValidation: true }
    )

    await boot(spec)

    const doc = await db.collection('ref-drift').findOne({ title: 'sneaked' })
    expect(doc?.ownerId).toBeInstanceOf(ObjectId)
    expect((doc?.ownerId as ObjectId).toString()).toBe(sneaked)

    /** Still exactly one ledger row — the repair is the probe's, not a re-run migration. */
    expect(await ledgerOf(mongo, 'ref-drift')).toHaveLength(1)
  })

  it('keeps working schema-less, the auth identity shape', async () => {
    const { context } = await boot(
      { alias: 'ref-account' },
      { alias: 'ref-profile', declare: r => r.reference('userId' as never, 'ref-account') as never }
    )
    const accounts = context.resource<MongoResource<Owner>>('ref-account')
    const profiles = context.resource<MongoResource<Owner & { userId?: string }>>('ref-profile')

    const account = await accounts.create({ title: 'account' })
    const profile = await profiles.create({ title: 'profile', userId: account.id })
    expect(profile.userId).toBe(account.id!)

    const stored = await raw(async client =>
      await client.db(suite.database).collection('ref-profile').findOne({ _id: new ObjectId(profile.id!) }))
    expect(stored?.userId).toBeInstanceOf(ObjectId)

    const listed = await profiles.list({ userId: account.id! })
    expect(listed.items.map(i => i.title)).toEqual(['profile'])

    /** The auth fallback shape: a composite key probing the reference matches nothing. */
    const none = await profiles.list({ userId: 'one-time-token:abc' })
    expect(none.items).toHaveLength(0)
  })

  it('updates through the reference and by the reference field', async () => {
    const { context } = await boot(
      { alias: 'ref-owner' },
      { alias: 'ref-upd', schema: itemSchema, declare: r => r.reference('ownerId', 'ref-owner') }
    )
    const owners = context.resource<MongoResource<Owner>>('ref-owner')
    const items = context.resource<MongoResource<Item>>('ref-upd')

    const owner = await owners.create({ title: 'owner' })
    const next = await owners.create({ title: 'next' })
    const item = await items.create({ title: 'up', ownerId: owner.id, key: 'k1' })

    const updated = await items.update({ ...item, ownerId: next.id })
    expect(updated.ownerId).toBe(next.id!)

    /** Addressing the record BY its reference field converts the lookup value too. */
    const byRef = await items.update({ ...updated, title: 'by-ref' }, 'ownerId')
    expect(byRef.title).toBe('by-ref')

    const stored = await raw(async client =>
      await client.db(suite.database).collection('ref-upd').findOne({ _id: new ObjectId(item.id!) }))
    expect(stored?.ownerId).toBeInstanceOf(ObjectId)

    const gone = await items.delete(next.id!, 'ownerId')
    expect(gone?.title).toBe('by-ref')
  })

  it('survives redeclaration and reboot without conflicts', async () => {
    const spec: Built = {
      alias: 'ref-stable', schema: itemSchema, declare: r => r.reference('ownerId', 'ref-owner')
    }
    await boot(spec)
    const { mongo } = await boot(spec)

    expect(await ledgerOf(mongo, 'ref-stable')).toHaveLength(1)

    /** A fresh process: declarations rebuilt from source, ledger untouched. */
    resetDeclarations('ref-stable')
    const { mongo: rebooted } = await boot(spec)
    expect(await ledgerOf(rebooted, 'ref-stable')).toHaveLength(1)
  })
})
