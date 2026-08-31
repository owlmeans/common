import type { BasicContext } from '@owlmeans/context'
import { MigrationStage, runMigrations } from '@owlmeans/resource'
import type { DbConfig, MigrationReport, ResourceRecord } from '@owlmeans/resource'
import type { PoolClient } from 'pg'

import { DEF_MIGRATIONS_TABLE, PgAutoSync } from '../consts.js'
import { getDeclaration } from '../declarations.js'
import { describePgError, pgErrorToResourceError } from '../errors.js'
import type {
  PgRuntimeTable, PostgresDb, PostgresMeta, PostgresResource, TableSpec
} from '../types.js'
import { planForeignKeys, planSync } from './diff.js'
import { introspectTable } from './introspect.js'
import { makeMigrationStore } from './migrations.js'
import { pgTableName } from './name.js'
import { schemaToTableSpec } from './schema.js'
import { refOf, resolvePlaceholders } from './sql.js'
import { acquireLock, applyPlan, ensureSchema, releaseLock } from './sync.js'
import { specToTable } from './table.js'

export interface TableInit {
  spec: TableSpec
  /** The Drizzle table CRUD is built against. */
  entity: PgRuntimeTable
  reports: MigrationReport[]
}

/**
 * Bring a resource's table to the shape its schema declares, then hand back everything the
 * resource needs to query it. The Postgres counterpart of mongo's `initializeCollection`.
 *
 * The whole sequence runs inside a session level advisory lock keyed on the qualified table
 * name, so replicas booting simultaneously converge one at a time instead of racing each
 * other's DDL — a race mongo's converge-on-boot leaves open.
 *
 * Order is deliberate:
 *
 *  1. probe for the table
 *  2. absent → *baseline* every registered migration; present → run the `pre` ones
 *  3. reconcile structure against the schema
 *  4. present → run the `post` migrations
 *  5. queue foreign keys for after every resource has initialized
 *
 * Step 2 is what stops the two mechanisms colliding. On a fresh deployment the table is
 * created directly to its final shape, so migrations that would have produced that shape
 * are recorded as satisfied rather than replayed against a table that already matches.
 */
export const initializeTable = async (
  db: PostgresDb, config: DbConfig, resource: PostgresResource<ResourceRecord>,
  context: BasicContext<any>, defer: (task: () => Promise<void>) => void
): Promise<TableInit> => {
  const declaration = getDeclaration(resource.alias)
  const meta = (config.meta ?? {}) as PostgresMeta
  const mode = meta.autoSync ?? PgAutoSync.Full

  const spec = schemaToTableSpec(
    resource.alias, resource.schema ?? declaration.schema, db.schema,
    pgTableName(config, resource), mode !== PgAutoSync.Off, declaration.indexes
  )
  const entity = specToTable(spec)
  const reports: MigrationReport[] = []

  const client = await db.pool.connect()
  try {
    await acquireLock(client, spec.qualified)
    await ensureSchema(client, spec.schema)

    const resolve = (text: string): string => resolvePlaceholders(text, context, spec)
    const ref = (alias?: string): string => refOf(context, spec, alias)
    const store = makeMigrationStore(client, spec, DEF_MIGRATIONS_TABLE, resolve, ref)

    const fresh = !(await introspectTable(client, spec.schema, spec.table, spec.qualified)).exists

    reports.push(await runMigrations(resource.alias, declaration.migrations, store, fresh
      ? { baseline: true }
      : { stage: MigrationStage.Pre }))

    if (spec.autoSync) {
      /** Re-read: a `pre` migration may have reshaped exactly what the diff is about to compare. */
      const live = await introspectTable(client, spec.schema, spec.table, spec.qualified)
      const plan = planSync(spec, live, mode === PgAutoSync.Additive)
      await applyPlan(client, spec, plan)
    }

    if (!fresh) {
      reports.push(await runMigrations(
        resource.alias, declaration.migrations, store, { stage: MigrationStage.Post }
      ))
    }

    for (const report of reports) {
      if (report.applied.length > 0) {
        console.log(
          `@owlmeans/postgres-resource: ${spec.qualified} applied ${report.stage} migrations —`
          + ` ${report.applied.join(', ')}`
        )
      }
    }
  } finally {
    await releaseLock(client, spec.qualified)
    client.release()
  }

  if (spec.references.length > 0) {
    defer(async () => { await applyForeignKeys(db, spec, context) })
  }

  return { spec, entity, reports }
}

/**
 * Add the foreign keys the schema declares, skipping any Postgres already holds.
 *
 * Constraints are compared by name only. A key whose *definition* drifted has to be dropped
 * by hand or in a migration: `ALTER TABLE ... DROP CONSTRAINT` on a foreign key is not a
 * change worth making on a boot nobody is watching.
 */
export const applyForeignKeys = async (
  db: PostgresDb, spec: TableSpec, context: BasicContext<any>
): Promise<void> => {
  const client = await db.pool.connect()
  try {
    const statements = planForeignKeys(spec, context)
    const live = await introspectTable(client, spec.schema, spec.table, spec.qualified)
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
