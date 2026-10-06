import { memoHelper } from '@owlmeans/context'
import { PlanningError, type Relationship, type RelationshipWhere } from '@owlmeans/planning'
import type { ListResult } from '@owlmeans/resource'
import { sqlHelper } from '../sql.js'
import type { SqlContext } from '../types.js'
import type { LinkSqlHelper } from './link-sql/types.js'

const fixed = (where: RelationshipWhere) => ({
  entityId: where.entityId, id: where.id, from: where.from, to: where.to, type: where.type, project: where.project,
})

export const makeLinkSqlHelper = (sql: SqlContext): LinkSqlHelper => {
  const { col, insertOf, recordOf, whereOf } = sqlHelper

  const listLinks = async (where: RelationshipWhere): Promise<ListResult<Relationship>> => {
    const spec = sql.tables.link
    const condition = whereOf(spec, fixed(where))
    const rows = await sql.runner.query(
      `SELECT * FROM ${spec.qualified} WHERE ${condition.text} ORDER BY ${col(spec, 'createdAt')}, ${col(spec, 'id')}`, condition.params
    )
    const items = rows.map(row => recordOf<Relationship>(row, spec))
    return { items, total: items.length }
  }

  const putLink = async (link: Relationship, id: () => string): Promise<Relationship> => {
    const spec = sql.tables.link
    const statement = insertOf(spec, { ...link, id: link.id ?? id() } as unknown as Record<string, unknown>, {
      tail: `ON CONFLICT (${col(spec, 'from')}, ${col(spec, 'to')}, ${col(spec, 'type')}) DO NOTHING RETURNING *`,
    })
    const inserted = await sql.runner.query(statement.text, statement.params)
    if (inserted[0] != null) {
      return recordOf<Relationship>(inserted[0], spec)
    }
    const existing = await listLinks({ entityId: link.entityId, from: link.from, to: link.to, type: link.type })
    return existing.items[0] ?? link
  }

  const dropLinks = async (where: RelationshipWhere): Promise<number> => {
    if (where.id == null && where.from == null && where.to == null && where.type == null && where.project == null) {
      throw new PlanningError('links:drop-empty')
    }
    const spec = sql.tables.link
    const condition = whereOf(spec, fixed(where))
    return (await sql.runner.query(
      `DELETE FROM ${spec.qualified} WHERE ${condition.text} RETURNING ${col(spec, 'id')}`, condition.params
    )).length
  }

  return { listLinks, putLink, dropLinks }
}

/** The link statements of one runner and table set — one per `SqlContext`. */
export const linkSqlOf = memoHelper.oncePer(makeLinkSqlHelper)
