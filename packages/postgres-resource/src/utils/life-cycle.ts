import type { BasicContext } from '@owlmeans/context'
import { MigrationStage, runMigrations, type DbConfig, type MigrationReport, type ResourceRecord } from '@owlmeans/resource'
import { logger } from '@owlmeans/log'
import type { PoolClient } from 'pg'

import { DEF_MIGRATIONS_TABLE, PgAutoSync } from '../consts.js'
import { pgDeclarationHelper } from '../declarations.js'
import { pgErrorHelper } from '../pg-error.js'
import type { PostgresDb, PostgresMeta, PostgresResource, TableSpec } from '../types.js'
import { pgDiffHelper } from './diff.js'
import { makePgIntrospectHelper } from './introspect.js'
import type { PgLifeCycleHelper } from './life-cycle/types.js'
import { makeMigrationStore } from './migrations.js'
import { pgNameHelper } from './name.js'
import { pgSchemaHelper } from './schema.js'
import { pgPlaceholdersOf } from './sql.js'
import { makePgSyncHelper } from './sync.js'
import { specToTable } from './table.js'
import type { TableInit } from './types.js'

const log = logger('postgres-resource')

export const makePgLifeCycleHelper = (db: PostgresDb): PgLifeCycleHelper => {
  const { describePgError, pgErrorToResourceError } = pgErrorHelper

  const initializeTable = async (
    config: DbConfig, resource: PostgresResource<ResourceRecord>,
    context: BasicContext<any>, defer: (task: () => Promise<void>) => void
  ): Promise<TableInit> => {
    const declaration = pgDeclarationHelper.getDeclaration(resource.alias)
    const meta = (config.meta ?? {}) as PostgresMeta
    const mode = meta.autoSync ?? PgAutoSync.Full

    const spec = pgSchemaHelper.schemaToTableSpec(
      resource.alias, resource.schema ?? declaration.schema, db.schema,
      pgNameHelper.pgTableName(config, resource), mode !== PgAutoSync.Off, declaration.indexes
    )
    const entity = specToTable(spec)
    const reports: MigrationReport[] = []

    const client = await db.pool.connect()
    const sync = makePgSyncHelper(client)
    const introspect = makePgIntrospectHelper(client)
    try {
      await sync.acquireLock(spec.qualified)
      await sync.ensureSchema(spec.schema)

      const placeholders = pgPlaceholdersOf(context)
      const resolve = (text: string): string => placeholders.resolvePlaceholders(text, spec)
      const ref = (alias?: string): string => placeholders.refOf(spec, alias)
      const store = makeMigrationStore(client, spec, DEF_MIGRATIONS_TABLE, resolve, ref)

      const fresh = !(await introspect.introspectTable(spec.schema, spec.table, spec.qualified)).exists

      reports.push(await runMigrations(resource.alias, declaration.migrations, store, fresh
        ? { baseline: true }
        : { stage: MigrationStage.Pre }))

      if (spec.autoSync) {
        /** Re-read: a `pre` migration may have reshaped exactly what the diff is about to compare. */
        const live = await introspect.introspectTable(spec.schema, spec.table, spec.qualified)
        const plan = pgDiffHelper.planSync(spec, live, mode === PgAutoSync.Additive)
        await sync.applyPlan(spec, plan)
      }

      if (!fresh) {
        reports.push(await runMigrations(
          resource.alias, declaration.migrations, store, { stage: MigrationStage.Post }
        ))
      }

      for (const report of reports) {
        if (report.applied.length > 0) {
          log.info('Migrations applied', {
            resource: resource.alias, table: spec.qualified, stage: report.stage, applied: report.applied,
          }, { event: 'migration.applied' })
        }
      }
    } finally {
      await sync.releaseLock(spec.qualified)
      client.release()
    }

    if (spec.references.length > 0) {
      defer(async () => { await applyForeignKeys(spec, context) })
    }

    return { spec, entity, reports }
  }

  const applyForeignKeys = async (spec: TableSpec, context: BasicContext<any>): Promise<void> => {
    const client = await db.pool.connect()
    try {
      const statements = pgDiffHelper.planForeignKeys(spec, context)
      const live = await makePgIntrospectHelper(client).introspectTable(spec.schema, spec.table, spec.qualified)
      if (!live.exists) {
        return
      }
      const present = live.constraints.map(constraint => constraint.name)

      for (const statement of statements) {
        if (present.includes(statement.target)) {
          continue
        }
        await apply(client, spec, statement.sql)
      }
    } finally {
      client.release()
    }
  }

  const apply = async (client: PoolClient, spec: TableSpec, statement: string): Promise<void> => {
    try {
      await client.query(statement)
    } catch (error) {
      const translated = pgErrorToResourceError(error)
      /**
       * A foreign key failing means live rows point at nothing. That's a data problem the
       * boot can't fix, and refusing to start is better than starting with the constraint
       * quietly missing.
       */
      throw Object.assign(translated, {
        message: `${spec.qualified}: ${describePgError(error)} — statement: ${statement}`
      })
    }
  }

  return { initializeTable, applyForeignKeys }
}
