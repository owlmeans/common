import { SchemaConflict, type SchemaStore, type ScopedSchemaRecord } from '@owlmeans/planning'
import { SCHEMA_HEAD_KEY, SCHEMA_HEAD_KIND } from '../consts.js'
import { sqlHelper } from '../sql.js'
import type { SqlContext, SqlRunner } from '../types.js'
import { schemaSqlOf } from './schema-sql.js'
import type { SchemaPortDeps } from './types.js'

/**
 * The data-defined schema port over `planning-schema`.
 *
 * `put` is one transaction: bump the organization's revision row, write the record under a
 * compare-and-set on `version` (an INSERT that must not conflict for version 1, an UPDATE guarded
 * on `version - 1` after), NOTIFY a schema frame. `revision` reads the head row — one primary read,
 * so every lookup of a resolved layer sees a write committed anywhere.
 */
export const makeSchemaPort = (deps: SchemaPortDeps): SchemaStore => {
  const { clientRunner, col, insertOf, recordOf } = sqlHelper

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
        const schemaSql = schemaSqlOf(sql)
        const spec = sql.tables.schema
        const rev = await schemaSql.bumpRevision(record.entityId, deps.now(), deps.ids)
        const values = { ...record, id: record.id ?? deps.ids(), rev, retired: record.retired === true ? true : undefined }
        let rows: Record<string, unknown>[]
        if (record.version === 1) {
          const insert = insertOf(spec, values as unknown as Record<string, unknown>, {
            tail: `ON CONFLICT ${schemaSql.scopeTarget()} DO NOTHING RETURNING *`,
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
        const schemaSql = schemaSqlOf(sql)
        const purged = await schemaSql.purgeSchemaLayers(where.entityId, [where.project])
        if (purged > 0) {
          await schemaSql.bumpRevision(where.entityId, deps.now(), deps.ids)
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

/** @deprecated compat:factory-refactor — use `schemaSqlOf(sql).bumpRevision(…)` */
export const bumpRevision = async (sql: SqlContext, entityId: string, at: string, id: () => string): Promise<number> =>
  await schemaSqlOf(sql).bumpRevision(entityId, at, id)

/** @deprecated compat:factory-refactor — use `schemaSqlOf(sql).purgeSchemaLayers(…)` */
export const purgeSchemaLayers = async (sql: SqlContext, entityId: string, projects: readonly string[]): Promise<number> =>
  await schemaSqlOf(sql).purgeSchemaLayers(entityId, projects)
