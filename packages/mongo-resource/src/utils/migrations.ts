import type { BasicContext } from '@owlmeans/context'
import type { DbConfig, Migration, MigrationStage, MigrationStore, ResourceRecord } from '@owlmeans/resource'
import type { Collection, Db } from 'mongodb'

import {
  DEF_MIGRATION_POLL, DEF_MIGRATION_WAIT, DEF_MIGRATIONS_COLLECTION, MONGO_DUPLICATE_KEY
} from '../consts.js'
import type { MongoDbService, MongoResource, MongoTx } from '../types.js'
import { DEFAULT_DB_ALIAS } from '../consts.js'
import { mongoCollectionName } from './name.js'

interface LedgerRecord {
  alias: string
  name: string
  stage: MigrationStage
  checksum: string | null
  baseline: boolean
  startedAt: Date
  /** `null` while a replica is running it — the claim, not the completion. */
  completedAt: Date | null
  durationMs: number | null
}

const isDuplicateKey = (error: unknown): boolean =>
  (error as { code?: number } | null)?.code === MONGO_DUPLICATE_KEY

/**
 * A transaction façade over the database. Alias resolution is injected so migrations can
 * address other resources without importing the context.
 *
 * Names are resolved through {@link mongoCollectionName}, not through the other resource's
 * live `collection` handle, because at migration time that resource may not have
 * initialized yet — registration order is not dependency order. The name is a pure
 * function of the config and the alias, so it's knowable either way.
 */
export const makeMongoTx = (
  db: Db, collection: Collection, config: DbConfig, context: BasicContext<any>, self: string
): MongoTx => {
  const ref = (alias?: string): string => {
    if (alias == null || alias === self) {
      return collection.collectionName
    }

    // Name the target's collection from the target's OWN db config. Resources registered under
    // different db aliases can share one database while carrying different `resourcePrefix`es, and
    // naming one of them with this migration's config silently addresses a collection that does not
    // exist — reads come back empty and writes create a decoy beside the real thing.
    const target = context.resource<MongoResource<ResourceRecord>>(alias)
    let targetConfig = config
    try {
      const mongo = context.service<MongoDbService>(target.serviceAlias ?? target.dbAlias ?? DEFAULT_DB_ALIAS)
      targetConfig = mongo.config(target.dbAlias ?? DEFAULT_DB_ALIAS) ?? config
    } catch {
      // A resource whose service is not reachable from here keeps the caller's config — the
      // historical behaviour, and correct whenever both share one alias.
    }

    return mongoCollectionName(targetConfig, target)
  }

  return {
    db,
    collection,
    ref,
    use: alias => alias == null || alias === self ? collection : db.collection(ref(alias))
  }
}

const waitForClaim = async (
  ledger: Collection<LedgerRecord>, alias: string, name: string
): Promise<void> => {
  const deadline = Date.now() + DEF_MIGRATION_WAIT
  while (Date.now() < deadline) {
    const row = await ledger.findOne({ alias, name })
    if (row == null) {
      /** The claim was withdrawn — the other replica's migration failed, and so must this boot. */
      throw new Error(`${alias}/${name}: abandoned by the replica that claimed it`)
    }
    if (row.completedAt != null) {
      return
    }
    await new Promise(resolve => setTimeout(resolve, DEF_MIGRATION_POLL))
  }

  throw new Error(`${alias}/${name}: still running elsewhere after ${DEF_MIGRATION_WAIT}ms`)
}

/**
 * Migration ledger, one collection per database.
 *
 * Where the Postgres store commits the ledger row inside the migration's own transaction,
 * this one can't — see {@link MongoTx}. It uses claim-then-complete instead: the unique
 * index on `(alias, name)` is the mutual exclusion primitive, so a replica that loses the
 * race to insert waits for the winner rather than running the same migration twice.
 */
export const makeMongoMigrationStore = (
  db: Db, tx: MongoTx, name: string = DEF_MIGRATIONS_COLLECTION
): MigrationStore<MongoTx> => {
  const ledger = (): Collection<LedgerRecord> => db.collection<LedgerRecord>(name)

  return {
    ensure: async () => {
      await ledger().createIndex({ alias: 1, name: 1 }, { name: 'alias_name_unique', unique: true })
    },

    applied: async alias => {
      /**
       * Completed rows only. A claim still holding a null `completedAt` belongs to a replica
       * running right now, and treating it as applied would let this process carry on against
       * a half-migrated database.
       */
      const rows = await ledger().find({ alias, completedAt: { $ne: null } }).toArray()

      return rows.reduce<Record<string, string | null>>((applied, row) => {
        applied[row.name] = row.checksum

        return applied
      }, {})
    },

    baseline: async (alias, migrations) => {
      const now = new Date()
      /**
       * `$setOnInsert` upserts rather than plain inserts: two replicas creating the same
       * collection at once both baseline, and the second must be a no-op, not a crash.
       */
      await ledger().bulkWrite(migrations.map(migration => ({
        updateOne: {
          filter: { alias, name: migration.name },
          update: {
            $setOnInsert: {
              alias,
              name: migration.name,
              stage: migration.stage,
              checksum: migration.checksum,
              baseline: true,
              startedAt: now,
              completedAt: now,
              durationMs: 0
            }
          },
          upsert: true
        }
      })), { ordered: false })
    },

    run: async (alias: string, migration: Migration<MongoTx>) => {
      const started = Date.now()
      try {
        await ledger().insertOne({
          alias,
          name: migration.name,
          stage: migration.stage,
          checksum: migration.checksum,
          baseline: false,
          startedAt: new Date(started),
          completedAt: null,
          durationMs: null
        })
      } catch (error) {
        if (!isDuplicateKey(error)) {
          throw error
        }

        return await waitForClaim(ledger(), alias, migration.name)
      }

      try {
        await migration.apply(tx)
      } catch (error) {
        /**
         * Withdraw the claim so the next boot retries. Postgres rolls its ledger row back
         * with the migration itself; without a transaction the claim has to be released by
         * hand, and leaving it would wedge every future boot on a migration that never ran.
         */
        await ledger().deleteOne({ alias, name: migration.name }).catch(() => undefined)
        throw error
      }

      await ledger().updateOne(
        { alias, name: migration.name },
        { $set: { completedAt: new Date(), durationMs: Date.now() - started } }
      )
    }
  }
}
