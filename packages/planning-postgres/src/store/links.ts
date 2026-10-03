import { PlanningError } from '@owlmeans/planning'
import type { Relationship, RelationshipStore, RelationshipWhere } from '@owlmeans/planning'
import type { Criteria, ListResult } from '@owlmeans/resource'
import { cleanRecord, col, insertOf, recordOf, whereOf } from '../sql.js'
import type { SqlContext } from '../sql.js'
import type { PlanningLinkResource } from '../types.js'

const clean = <T extends object>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

export const linkCriteria = (where: RelationshipWhere): Criteria<Relationship> => clean({
  entityId: where.entityId,
  id: where.id,
  from: where.from,
  to: where.to,
  type: where.type,
  project: where.project,
}) as Criteria<Relationship>

const fixed = (where: RelationshipWhere) => ({
  entityId: where.entityId, id: where.id, from: where.from, to: where.to, type: where.type, project: where.project,
})

/** Edges by fixed fields — this package's own statement, so it runs inside a fold's transaction. */
export const listLinks = async (sql: SqlContext, where: RelationshipWhere): Promise<ListResult<Relationship>> => {
  const spec = sql.tables.link
  const condition = whereOf(spec, fixed(where))
  const rows = await sql.runner.query(
    `SELECT * FROM ${spec.qualified} WHERE ${condition.text} ORDER BY ${col(spec, 'createdAt')}, ${col(spec, 'id')}`, condition.params
  )
  const items = rows.map(row => recordOf<Relationship>(row, spec))
  return { items, total: items.length }
}

/** One edge per `(from, to, type)`: an existing one is answered as it is. */
export const putLink = async (sql: SqlContext, link: Relationship, id: () => string): Promise<Relationship> => {
  const spec = sql.tables.link
  const statement = insertOf(spec, { ...link, id: link.id ?? id() } as unknown as Record<string, unknown>, {
    tail: `ON CONFLICT (${col(spec, 'from')}, ${col(spec, 'to')}, ${col(spec, 'type')}) DO NOTHING RETURNING *`,
  })
  const inserted = await sql.runner.query(statement.text, statement.params)
  if (inserted[0] != null) {
    return recordOf<Relationship>(inserted[0], spec)
  }
  const existing = await listLinks(sql, { entityId: link.entityId, from: link.from, to: link.to, type: link.type })
  return existing.items[0] ?? link
}

/** @throws {PlanningError} `links:drop-empty` for a where naming nothing but the organization */
export const dropLinks = async (sql: SqlContext, where: RelationshipWhere): Promise<number> => {
  if (where.id == null && where.from == null && where.to == null && where.type == null && where.project == null) {
    throw new PlanningError('links:drop-empty')
  }
  const spec = sql.tables.link
  const condition = whereOf(spec, fixed(where))
  return (await sql.runner.query(
    `DELETE FROM ${spec.qualified} WHERE ${condition.text} RETURNING ${col(spec, 'id')}`, condition.params
  )).length
}

export interface LinkPortDeps {
  sql: () => Promise<SqlContext>
  resource: () => PlanningLinkResource
  ids: () => string
}

export const makeLinkPort = (deps: LinkPortDeps): RelationshipStore => ({
  list: async (where, opts) => {
    await deps.sql()
    const listed = await deps.resource().list(linkCriteria(where), opts)
    return { ...listed, items: listed.items.map(item => cleanRecord(item)) }
  },

  put: async link => await putLink(await deps.sql(), link, deps.ids),

  drop: async where => await dropLinks(await deps.sql(), where),
})
