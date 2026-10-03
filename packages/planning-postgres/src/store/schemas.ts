import { SchemaConflict } from '@owlmeans/planning'
import type { SchemaStore, ScopedSchemaRecord, Unsubscribe } from '@owlmeans/planning'
import type { Pool } from 'pg'
import { SCHEMA_HEAD_KEY, SCHEMA_HEAD_KIND } from '../consts.js'
import { clientRunner, col, insertOf, recordOf } from '../sql.js'
import type { PlanningTables, SqlContext, SqlRunner } from '../sql.js'
import type { PlanningBus } from './bus.js'

/** The scope's uniqueness expression — the one the `…_scope` index is built on. */
const scopeTarget = (sql: SqlContext): string => {
  const spec = sql.tables.schema
  return `(${col(spec, 'entityId')}, COALESCE(${col(spec, 'project')}, ''), ${col(spec, 'kind')}, ${col(spec, 'key')})`
}

/**
 * Bump an organization's schema revision — its private `head` row, created at 1 — and answer the
 * new value. Runs inside the write's own transaction, so the revision moves exactly when it commits.
 */
export const bumpRevision = async (sql: SqlContext, entityId: string, at: string, id: () => string): Promise<number> => {
  const spec = sql.tables.schema
  const statement = insertOf(spec, {
    id: id(), entityId, kind: SCHEMA_HEAD_KIND, key: SCHEMA_HEAD_KEY, version: 1, rev: 1, definition: {}, createdAt: at,
  }, {
    as: 'existing',
    tail: `ON CONFLICT ${scopeTarget(sql)} DO UPDATE SET ${col(spec, 'rev')} = COALESCE(existing.${col(spec, 'rev')}, 0) + 1,`
      + ` ${col(spec, 'updatedAt')} = EXCLUDED.${col(spec, 'createdAt')} RETURNING ${col(spec, 'rev')} AS rev`,
  })
  const rows = await sql.runner.query<{ rev: number }>(statement.text, statement.params)
  return Number(rows[0]?.rev ?? 0)
}

/** Remove the layers of the given projects inside a transaction; answers how many records went. */
export const purgeSchemaLayers = async (sql: SqlContext, entityId: string, projects: readonly string[]): Promise<number> => {
  if (projects.length === 0) {
    return 0
  }
  const spec = sql.tables.schema
  return (await sql.runner.query(
    `DELETE FROM ${spec.qualified} WHERE ${col(spec, 'entityId')} = $1 AND ${col(spec, 'project')} = ANY($2) RETURNING ${col(spec, 'id')}`,
    [entityId, [...projects]]
  )).length
}

export interface SchemaPortDeps {
  sql: () => Promise<SqlContext>
  pool: () => Promise<Pool>
  tables: () => Promise<PlanningTables>
  bus: PlanningBus
  ids: () => string
  now: () => string
  /** Every local watcher, told after a write of this process commits. */
  touched: (entityId: string) => void
  watch: (listener: (entityId: string) => void) => Unsubscribe
}

/**
 * The data-defined schema port over `planning-schema`.
 *
 * `put` is one transaction: bump the organization's revision row, write the record under a
 * compare-and-set on `version` (an INSERT that must not conflict for version 1, an UPDATE guarded
 * on `version - 1` after), NOTIFY a schema frame. `revision` reads the head row — one primary read,
 * so every lookup of a resolved layer sees a write committed anywhere.
 */
export const makeSchemaPort = (deps: SchemaPortDeps): SchemaStore => {
  const transaction = async <R>(run: (sql: SqlContext) => Promise<R>): Promise<R> => {
    const client = await (await deps.pool()).connect()
    const tables = await deps.tables()
    const runner: SqlRunner = clientRunner(client)
    try {
      await client.query('BEGIN')
      const result = await run({ runner, tables })
      await client.query('COMMIT')
      return result
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined)
      throw error
    } finally {
      client.release()
    }
  }

  return {
    list: async where => {
      const sql = await deps.sql()
      const spec = sql.tables.schema
      const clauses = [`${col(spec, 'entityId')} = $1`, `${col(spec, 'kind')} <> '${SCHEMA_HEAD_KIND}'`]
      const params: unknown[] = [where.entityId]
      if (where.project === null) {
        clauses.push(`${col(spec, 'project')} IS NULL`)
      } else if (where.project !== undefined) {
        params.push(where.project)
        clauses.push(`${col(spec, 'project')} = $${params.length}`)
      }
      if (where.kind != null) {
        params.push(where.kind)
        clauses.push(`${col(spec, 'kind')} = $${params.length}`)
      }
      if (where.key != null) {
        params.push(Array.isArray(where.key) ? where.key : [where.key])
        clauses.push(`${col(spec, 'key')} = ANY($${params.length})`)
      }
      if (where.retired != null) {
        clauses.push(where.retired ? `${col(spec, 'retired')} IS TRUE` : `${col(spec, 'retired')} IS NOT TRUE`)
      }
      const rows = await sql.runner.query(
        `SELECT * FROM ${spec.qualified} WHERE ${clauses.join(' AND ')}`
        + ` ORDER BY ${col(spec, 'kind')}, ${col(spec, 'key')}, ${col(spec, 'project')} NULLS FIRST`, params
      )
      return rows.map(row => recordOf<ScopedSchemaRecord>(row, spec))
    },

    put: async record => {
      const written = await transaction(async sql => {
        const spec = sql.tables.schema
        const rev = await bumpRevision(sql, record.entityId, deps.now(), deps.ids)
        const values = { ...record, id: record.id ?? deps.ids(), rev, retired: record.retired === true ? true : undefined }
        let rows: Record<string, unknown>[]
        if (record.version === 1) {
          const insert = insertOf(spec, values as unknown as Record<string, unknown>, {
            tail: `ON CONFLICT ${scopeTarget(sql)} DO NOTHING RETURNING *`,
          })
          rows = await sql.runner.query(insert.text, insert.params)
        } else {
          rows = await sql.runner.query(
            `UPDATE ${spec.qualified} SET ${col(spec, 'version')} = $5, ${col(spec, 'definition')} = $6::jsonb,`
            + ` ${col(spec, 'retired')} = $7, ${col(spec, 'rev')} = $8, ${col(spec, 'updatedAt')} = $9, ${col(spec, 'by')} = $10::jsonb`
            + ` WHERE ${col(spec, 'entityId')} = $1 AND COALESCE(${col(spec, 'project')}, '') = $2 AND ${col(spec, 'kind')} = $3`
            + ` AND ${col(spec, 'key')} = $4 AND ${col(spec, 'version')} = $5 - 1 RETURNING *`,
            [
              record.entityId, record.project ?? '', record.kind, record.key, record.version,
              JSON.stringify(record.definition), record.retired === true ? true : null, rev,
              record.updatedAt ?? deps.now(), record.by != null ? JSON.stringify(record.by) : null,
            ]
          )
        }
        if (rows[0] == null) {
          throw new SchemaConflict(`${record.kind}:${record.key}:version:${record.version}`)
        }
        await deps.bus.notify(sql.runner, { t: 's', e: record.entityId })
        return recordOf<ScopedSchemaRecord>(rows[0], spec)
      })
      deps.touched(record.entityId)
      return written
    },

    purge: async where => {
      const count = await transaction(async sql => {
        const purged = await purgeSchemaLayers(sql, where.entityId, [where.project])
        if (purged > 0) {
          await bumpRevision(sql, where.entityId, deps.now(), deps.ids)
          await deps.bus.notify(sql.runner, { t: 's', e: where.entityId })
        }
        return purged
      })
      if (count > 0) {
        deps.touched(where.entityId)
      }
      return count
    },

    revision: async entityId => {
      const sql = await deps.sql()
      const spec = sql.tables.schema
      const rows = await sql.runner.query<{ rev: number | null }>(
        `SELECT ${col(spec, 'rev')} AS rev FROM ${spec.qualified} WHERE ${col(spec, 'entityId')} = $1`
        + ` AND ${col(spec, 'project')} IS NULL AND ${col(spec, 'kind')} = '${SCHEMA_HEAD_KIND}' AND ${col(spec, 'key')} = '${SCHEMA_HEAD_KEY}'`,
        [entityId]
      )
      return Number(rows[0]?.rev ?? 0)
    },

    watch: listener => deps.watch(listener),
  }
}
