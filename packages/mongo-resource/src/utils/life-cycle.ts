import { MigrationStage, runMigrations } from '@owlmeans/resource'
import type { DbConfig, MigrationReport, ResourceRecord } from '@owlmeans/resource'
import type { BasicContext } from '@owlmeans/context'
import type { MongoReference, MongoResource } from '../types.js'
import type { Db, Collection, Document, IndexSpecification } from 'mongodb'
import { DEF_MIGRATIONS_COLLECTION } from '../consts.js'
import { getDeclaration } from '../declarations.js'
import { mongoCollectionName } from './name.js'
import { applyReferenceTypes, schemaToMongoSchema } from './schema.js'
import { updateIndexes } from './indexes.js'
import { makeMongoMigrationStore, makeMongoTx } from './migrations.js'
import { reconcileReferences } from './refs.js'

/**
 * Bring a resource's collection to the shape its schema declares.
 *
 * Order is deliberate, and matches the Postgres counterpart:
 *
 *  1. probe for the collection
 *  2. absent → *baseline* every registered migration; present → run the `pre` ones
 *     (including the system `$ref:` migrations that convert declared references)
 *  3. create the collection, or update its validator and indexes
 *  4. present → run the `post` migrations
 *  5. reconcile declared references — the second half of their double check: the ledger
 *     said whether the `$ref:` migration ran, this probes the collection itself and
 *     converts whatever strings still slipped through
 *
 * Step 2 is what stops the two mechanisms colliding. A `pre` migration runs before the
 * validator is tightened, so it can reshape documents the new validator would reject. On a
 * collection this call just created there is nothing to reshape — replaying a historical
 * migration against a collection born in its final shape would at best scan for nothing —
 * so the migrations are recorded as satisfied instead of run.
 *
 * `context` is optional so the existing three-argument call keeps working; without it a
 * migration's `use`/`ref` can only address the owning resource.
 */
export const initializeCollection = async (
  db: Db, config: DbConfig, resource: MongoResource<ResourceRecord>,
  context?: BasicContext<any>
): Promise<Collection> => {
  const name = mongoCollectionName(config, resource)
  const fresh = !await db.listCollections({ name }).hasNext()

  appendReferenceIndexes(resource)

  const migrate = prepareMigrations(db, config, resource, name, context)
  await migrate(fresh ? { baseline: true } : { stage: MigrationStage.Pre })

  const collection = fresh
    ? await createCollection(db, name, resource)
    : await updateCollection(db, name, resource)

  if (!fresh) {
    await migrate({ stage: MigrationStage.Post })
    await reconcileReferences(collection, referencesOf(resource), resource.alias)
  }

  return collection
}

/** Tolerates hand-built resource objects that predate the reference capability. */
const referencesOf = (resource: MongoResource<ResourceRecord>): MongoReference[] =>
  resource.references?.() ?? []

/**
 * A declared reference is indexed at the mongo level — that's part of its contract. The
 * index is appended unless the resource already declares one with the same key pattern
 * (mongo refuses two indexes over identical keys, and the existing one — possibly
 * unique — wins).
 */
const appendReferenceIndexes = (resource: MongoResource<ResourceRecord>): void => {
  for (const ref of referencesOf(resource)) {
    if (ref.noIndex === true) {
      continue
    }
    resource.indexes = resource.indexes ?? []
    const spec = JSON.stringify({ [ref.field]: 1 })
    const present = resource.indexes.some(index =>
      JSON.stringify(index.index as IndexSpecification) === spec || index.name === `ref_${ref.field}`
    )
    if (!present) {
      resource.indexes.push({ name: `ref_${ref.field}`, index: { [ref.field]: 1 } })
    }
  }
}

/**
 * Bind the migration runner to this resource's database, or hand back a no-op when nothing
 * is registered — the overwhelmingly common case, and one that shouldn't pay for a ledger.
 */
const prepareMigrations = (
  db: Db, config: DbConfig, resource: MongoResource<ResourceRecord>, name: string,
  context?: BasicContext<any>
): (opts: { stage?: MigrationStage, baseline?: boolean }) => Promise<MigrationReport | null> => {
  const registry = getDeclaration(resource.alias).migrations
  if (registry.list().length < 1) {
    return async () => null
  }

  const ledgerName = (config.meta as { migrationsCollection?: string } | undefined)?.migrationsCollection
    ?? DEF_MIGRATIONS_COLLECTION
  /**
   * `db.collection()` never round-trips, so taking the handle before the collection exists
   * is safe — and on the fresh path the transaction is only ever baselined, never used.
   */
  const tx = makeMongoTx(db, db.collection(name), config, context as BasicContext<any>, resource.alias)
  const store = makeMongoMigrationStore(db, tx, ledgerName)

  return async opts => {
    const report = await runMigrations(resource.alias, registry, store, opts)
    if (report.applied.length > 0) {
      console.log(
        `@owlmeans/mongo-resource: ${name} applied ${report.stage} migrations —`
        + ` ${report.applied.join(', ')}`
      )
    }

    return report
  }
}

export const createCollection = async (db: Db, name: string, resource: MongoResource<ResourceRecord>): Promise<Collection> => {
  const collection = await db.createCollection(name, {
    ...(resource.schema != null ? {
      validator: {
        $jsonSchema: patchJsonSchema(applyReferenceTypes(
          schemaToMongoSchema(resource.schema), resource.schema, resource.references()
        ))
      }
    } : {})
  })

  if (resource.indexes != null) {
    await Promise.all(resource.indexes.map(
      async index => await collection.createIndex(index.index, {
        name: index.name, ...((index.options != null) ? index.options : {})
      })
    ))
  }

  return collection
}

export const updateCollection = async (db: Db, name: string, resource: MongoResource<ResourceRecord>): Promise<Collection> => {
  if (resource.schema != null) {
    const $jsonSchema = patchJsonSchema(applyReferenceTypes(
      schemaToMongoSchema(resource.schema), resource.schema, resource.references()
    ))
    await db.command({ collMod: name, validator: { $jsonSchema } })
  }

  const collection = db.collection(name)

  await updateIndexes(collection, resource)

  return collection
}

const patchJsonSchema = (schema: Document): Document => {
  if (schema.properties != null) {
    if (schema.properties._id == null) {
      schema.properties._id = { bsonType: 'objectId' }
    }
  }
  return schema
}
