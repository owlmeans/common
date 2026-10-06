import { MigrationStage, runMigrations } from '@owlmeans/resource'
import type { DbConfig, MigrationReport, ResourceRecord } from '@owlmeans/resource'
import type { BasicContext } from '@owlmeans/context'
import { logger } from '@owlmeans/log'
import type { MongoReference, MongoResource } from '../types.js'
import type { Db, Collection, Document, IndexSpecification } from 'mongodb'
import { DEF_MIGRATIONS_COLLECTION } from '../consts.js'
import { mongoDeclarationHelper } from '../declarations.js'
import type { MongoLifeCycleUtils } from './life-cycle/types.js'
import { mongoCollectionName } from './name.js'
import { mongoSchemaUtils } from './schema.js'
import { mongoIndexUtils } from './indexes.js'
import { makeMongoMigrationStore, makeMongoTx } from './migrations.js'
import { mongoRefHelper } from './refs.js'

const log = logger('mongo-resource')

export const makeMongoLifeCycleUtils = (db: Db): MongoLifeCycleUtils => {
  const { applyReferenceTypes, schemaToMongoSchema } = mongoSchemaUtils

  const initializeCollection = async (
    config: DbConfig, resource: MongoResource<ResourceRecord>,
    context?: BasicContext<any>
  ): Promise<Collection> => {
    const name = mongoCollectionName(config, resource)
    const fresh = !await db.listCollections({ name }).hasNext()

    appendReferenceIndexes(resource)

    const migrate = prepareMigrations(config, resource, name, context)
    await migrate(fresh ? { baseline: true } : { stage: MigrationStage.Pre })

    const collection = fresh
      ? await createCollection(name, resource)
      : await updateCollection(name, resource)

    if (!fresh) {
      await migrate({ stage: MigrationStage.Post })
      await mongoRefHelper.reconcileReferences(collection, referencesOf(resource), resource.alias)
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
    config: DbConfig, resource: MongoResource<ResourceRecord>, name: string,
    context?: BasicContext<any>
  ): (opts: { stage?: MigrationStage, baseline?: boolean }) => Promise<MigrationReport | null> => {
    const registry = mongoDeclarationHelper.getDeclaration(resource.alias).migrations
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
        log.info('Migrations applied', {
          resource: resource.alias, collection: name, stage: report.stage, applied: report.applied,
        }, { event: 'migration.applied' })
      }

      return report
    }
  }

  const createCollection = async (name: string, resource: MongoResource<ResourceRecord>): Promise<Collection> => {
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

  const updateCollection = async (name: string, resource: MongoResource<ResourceRecord>): Promise<Collection> => {
    if (resource.schema != null) {
      const $jsonSchema = patchJsonSchema(applyReferenceTypes(
        schemaToMongoSchema(resource.schema), resource.schema, resource.references()
      ))
      await db.command({ collMod: name, validator: { $jsonSchema } })
    }

    const collection = db.collection(name)

    await mongoIndexUtils.updateIndexes(collection, resource)

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

  return { initializeCollection, createCollection, updateCollection }
}
