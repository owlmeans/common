import { afterAll, describe, expect, test } from 'bun:test'
import { makeMongoResource, resetDeclarations } from '@owlmeans/mongo-resource'
import type { MongoTx } from '@owlmeans/mongo-resource'
import { MigrationConflict, MigrationError, MigrationStage } from '@owlmeans/resource'

import { gate, ledgerOf, makeSuite, raw } from './context.js'
import type { LedgerRow, MongoDbService, MongoResource, Note } from './context.js'

/**
 * `legacy` exists, `slug` does not. The validator carries `additionalProperties: false`, so
 * this is not merely documentation — writing a `slug` under this schema is refused.
 */
const v1 = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    legacy: { type: 'string', nullable: true }
  },
  required: ['title']
}

/** The mirror image: `slug` is writable now and `legacy` is not. */
const v2 = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    slug: { type: 'string', nullable: true }
  },
  required: ['title']
}

/**
 * Bodies live at module scope so their source text — and therefore their checksum — is
 * identical across the boots of one spec file. A body closed over a loop variable would
 * fingerprint the wrapper instead, which is the trap `createMigrationRegistry` documents.
 */
const ran: Record<string, number> = {}
const tick = (name: string): void => { ran[name] = (ran[name] ?? 0) + 1 }

/** Throws outright: if a baselined migration ever ran, the boot would fail rather than lie. */
const ghostPreBody = async (): Promise<void> => {
  tick('ghost-pre')
  throw new Error('a baselined migration must never run')
}
const ghostPostBody = async (): Promise<void> => {
  tick('ghost-post')
  throw new Error('a baselined migration must never run')
}

const seedBody = async (tx: MongoTx): Promise<void> => {
  tick('seed')
  await tx.collection.insertOne({ title: 'seeded' })
}

/** Valid under {@link v1} only — `legacy` is undeclared once the validator is tightened. */
const legacyBody = async (tx: MongoTx): Promise<void> => {
  tick('legacy')
  await tx.collection.updateMany({}, { $set: { legacy: 'touched' } })
}

/** Valid under {@link v2} only — and carrying `legacy` across proves the pre stage ran first. */
const slugBody = async (tx: MongoTx): Promise<void> => {
  tick('slug')
  await tx.collection.updateMany({}, [{ $set: { slug: '$legacy' } }, { $unset: 'legacy' }])
}

const failingBody = async (): Promise<void> => {
  tick('failing')
  throw new Error('deliberate')
}

const driftBody = async (tx: MongoTx): Promise<void> => { await tx.collection.countDocuments() }
const driftEdited = async (tx: MongoTx): Promise<void> => { await tx.collection.estimatedDocumentCount() }

const copyBody = async (tx: MongoTx): Promise<void> => {
  tick('copy')
  const source = await tx.use('mig-src').find({}, { projection: { _id: 0 } }).toArray()
  if (source.length > 0) {
    await tx.collection.insertMany(source)
  }
}

interface Built {
  alias: string
  schema?: unknown
  declare?: (resource: MongoResource<Note>) => void
}

const suite = makeSuite('migration')
const it = gate.skip ? test.skip : test

const build = (spec: Built): MongoResource<Note> => {
  const resource = makeMongoResource<Note, MongoResource<Note>>(spec.alias)
  resource.schema = (spec.schema ?? v1) as never
  spec.declare?.(resource)

  return resource
}

const boot = async (...specs: Built[]): Promise<MongoDbService> =>
  (await suite.boot({ resources: specs.map(build) })).mongo

const ledger = async (mongo: MongoDbService, alias: string): Promise<LedgerRow[]> =>
  await ledgerOf(mongo, alias)

describe('@owlmeans/mongo — code registered migrations', () => {
  if (gate.skip) {
    test.skip(gate.reason ?? 'mongo gate closed', () => {})

    return
  }

  afterAll(async () => {
    await suite.teardown()
  })

  it('baselines every migration on a collection it just created', async () => {
    const mongo = await boot({
      alias: 'mig-a',
      declare: resource => {
        resource.migration('0001-ghost', ghostPreBody)
        resource.migration('0002-ghost', ghostPostBody, MigrationStage.Post)
      }
    })

    const rows = await ledger(mongo, 'mig-a')
    expect(rows).toHaveLength(2)
    expect(rows.every(row => row.baseline)).toBe(true)
    /** A baselined row is complete on arrival — nothing is left holding a claim. */
    expect(rows.every(row => row.completedAt != null)).toBe(true)
    expect(rows.map(row => row.stage)).toEqual([MigrationStage.Pre, MigrationStage.Post])
    expect(ran['ghost-pre']).toBeUndefined()
    expect(ran['ghost-post']).toBeUndefined()
  })

  it('skips them again on the next boot', async () => {
    const mongo = await boot({
      alias: 'mig-a',
      declare: resource => {
        resource.migration('0001-ghost', ghostPreBody)
        resource.migration('0002-ghost', ghostPostBody, MigrationStage.Post)
      }
    })

    expect(await ledger(mongo, 'mig-a')).toHaveLength(2)
    expect(ran['ghost-pre']).toBeUndefined()
  })

  it('applies a migration added after the collection exists exactly once', async () => {
    await boot({ alias: 'mig-b' })

    const seed = (): Built => ({
      alias: 'mig-b',
      declare: resource => { resource.migration('0001-seed', seedBody, MigrationStage.Post) }
    })

    const mongo = await boot(seed())
    expect(ran.seed).toBe(1)

    const [row] = await ledger(mongo, 'mig-b')
    expect(row.baseline).toBe(false)
    expect(row.completedAt).not.toBeNull()

    /** Re-registering an identical body is a no-op, and the ledger row makes it a no-op twice. */
    await boot(seed())
    expect(ran.seed).toBe(1)
    expect(await ledger(mongo, 'mig-b')).toHaveLength(1)
  })

  /**
   * The ordering is observable rather than asserted indirectly: `legacyBody` writes a field
   * only the old validator allows and `slugBody` one only the new validator allows, so
   * either stage running on the wrong side of the validator update fails the boot outright.
   */
  it('runs pre before the validator is tightened and post after', async () => {
    const mongo = await boot({ alias: 'mig-c' })
    const db = await mongo.db()
    await db.collection('mig-c').insertOne({ title: 'existing', legacy: 'old' })

    await boot({
      alias: 'mig-c',
      schema: v2,
      declare: resource => {
        resource.migration('0001-legacy', legacyBody)
        resource.migration('0002-slug', slugBody, MigrationStage.Post)
      }
    })

    const doc = await db.collection('mig-c').findOne({}, { projection: { _id: 0 } })
    /** `touched`, not `old` — the value could only have been carried over by the pre stage. */
    expect(doc).toEqual({ title: 'existing', slug: 'touched' })
    expect(await ledger(mongo, 'mig-c')).toHaveLength(2)
  })

  it('aborts the boot on a throwing migration and withdraws its claim', async () => {
    await boot({ alias: 'mig-d' })

    await expect(boot({
      alias: 'mig-d',
      declare: resource => { resource.migration('0001-fail', failingBody, MigrationStage.Post) }
    })).rejects.toThrow(MigrationError)
    expect(ran.failing).toBe(1)

    /**
     * Read outside the context: it never came up. Without a transaction the claim has to be
     * released by hand, and a claim left behind would wedge every later boot on a migration
     * that never actually ran.
     */
    const rows = await raw(async client =>
      await client.db(suite.database).collection('_owlmeans_migrations').find({ alias: 'mig-d' }).toArray()
    )
    expect(rows).toHaveLength(0)
  })

  it('refuses an applied migration whose body has been edited', async () => {
    await boot({
      alias: 'mig-e',
      declare: resource => { resource.migration('0001-drift', driftBody, MigrationStage.Post) }
    })

    /** A restarted process: the registry is rebuilt from source, the ledger is not. */
    resetDeclarations('mig-e')

    await expect(boot({
      alias: 'mig-e',
      declare: resource => { resource.migration('0001-drift', driftEdited, MigrationStage.Post) }
    })).rejects.toThrow(MigrationConflict)
  })

  it('refuses an in-process redeclaration and accepts an identical one', () => {
    const resource = makeMongoResource<Note, MongoResource<Note>>('mig-x')
    resource.migration('0001-drift', driftBody)

    expect(() => resource.migration('0001-drift', driftBody)).not.toThrow()
    expect(() => resource.migration('0001-drift', driftEdited)).toThrow(MigrationConflict)
    resetDeclarations('mig-x')
  })

  it('records nothing for a resource that registers no migrations', async () => {
    const mongo = await boot({ alias: 'mig-none' })

    /** The overwhelmingly common case, and the one that short-circuits before the ledger. */
    expect(await ledger(mongo, 'mig-none')).toHaveLength(0)
  })

  /**
   * Registration order is irrelevant here, where in Postgres it is not: `ref` resolves a
   * collection *name* from the config and the alias — a pure function — rather than reaching
   * into another resource's initialized handle.
   */
  it('resolves another resource by alias inside a migration', async () => {
    const first = await boot({ alias: 'mig-src' }, { alias: 'mig-g' })
    await (await first.db()).collection('mig-src').insertOne({ title: 'from-source' })

    const mongo = await boot(
      {
        alias: 'mig-g',
        declare: resource => { resource.migration('0001-copy', copyBody, MigrationStage.Post) }
      },
      { alias: 'mig-src' }
    )
    expect(ran.copy).toBe(1)

    const copied = await (await mongo.db()).collection('mig-g').find({}, { projection: { _id: 0 } }).toArray()
    expect(copied).toEqual([{ title: 'from-source' }])
  })
})
