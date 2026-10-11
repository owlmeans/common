import { memoHelper } from '@owlmeans/context'
import { SCHEMA_HEAD_KEY, SCHEMA_HEAD_KIND } from '../consts.js'
import { sqlHelper } from '../sql.js'
import type { SqlContext } from '../types.js'
import type { SchemaSqlHelper } from './schema-sql/types.js'

export const makeSchemaSqlHelper = (sql: SqlContext): SchemaSqlHelper => {
  const { col, insertOf } = sqlHelper

  const scopeTarget = (): string => {
    const spec = sql.tables.schema
    return `(${col(spec, 'entityId')}, COALESCE(${col(spec, 'project')}, ''), ${col(spec, 'kind')}, ${col(spec, 'key')})`
  }

  const bumpRevision = async (entityId: string, at: string, id: () => string): Promise<number> => {
    const spec = sql.tables.schema
    const statement = insertOf(spec, {
      id: id(), entityId, kind: SCHEMA_HEAD_KIND, key: SCHEMA_HEAD_KEY, version: 1, rev: 1, definition: {}, createdAt: at,
    }, {
      as: 'existing',
      tail: `ON CONFLICT ${scopeTarget()} DO UPDATE SET ${col(spec, 'rev')} = COALESCE(existing.${col(spec, 'rev')}, 0) + 1,`
        + ` ${col(spec, 'updatedAt')} = EXCLUDED.${col(spec, 'createdAt')} RETURNING ${col(spec, 'rev')} AS rev`,
    })
    const rows = await sql.runner.query<{ rev: number }>(statement.text, statement.params)
    return Number(rows[0]?.rev ?? 0)
  }

  const purgeSchemaLayers = async (entityId: string, projects: readonly string[]): Promise<number> => {
    if (projects.length === 0) {
      return 0
    }
    const spec = sql.tables.schema
    return (await sql.runner.query(
      `DELETE FROM ${spec.qualified} WHERE ${col(spec, 'entityId')} = $1 AND ${col(spec, 'project')} = ANY($2) RETURNING ${col(spec, 'id')}`,
      [entityId, [...projects]]
    )).length
  }

  return { scopeTarget, bumpRevision, purgeSchemaLayers }
}

/** The schema statements of one runner and table set — one per `SqlContext`. */
export const schemaSqlOf = memoHelper.oncePer(makeSchemaSqlHelper)
