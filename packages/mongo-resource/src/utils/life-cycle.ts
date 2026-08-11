import { MigrationStage, runMigrations } from '@owlmeans/resource'
import type { DbConfig, MigrationReport, ResourceRecord } from '@owlmeans/resource'
import type { BasicContext } from '@owlmeans/context'
import type { MongoResource } from '../types.js'
import type { Db, Collection, Document } from 'mongodb'
import { DEF_MIGRATIONS_COLLECTION } from '../consts.js'
import { getDeclaration } from '../declarations.js'
import { mongoCollectionName } from './name.js'
import { schemaToMongoSchema } from './schema.js'
import { updateIndexes } from './indexes.js'
import { makeMongoMigrationStore, makeMongoTx } from './migrations.js'

/**
 * Bring a resource's collection to the shape its schema declares.
 *
 * Order is deliberate, and matches the Postgres counterpart:
 *
 *  1. probe for the collection
 *  2. absent → *baseline* every registered migration; present → run the `pre` ones
 *  3. create the collection, or update its validator and indexes
 *  4. present → run the `post` migrations
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

  const migrate = prepareMigrations(db, config, resource, name, context)
  await migrate(fresh ? { baseline: true } : { stage: MigrationStage.Pre })

  const collection = fresh
    ? await createCollection(db, name, resource)
    : await updateCollection(db, name, resource)

  if (!fresh) {
    await migrate({ stage: MigrationStage.Post })
  }

  return collection
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
        $jsonSchema: patchJsonSchema(schemaToMongoSchema(resource.schema))
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
    const $jsonSchema = patchJsonSchema(schemaToMongoSchema(resource.schema))
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
