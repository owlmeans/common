import type { Relationship, RelationshipStore, RelationshipWhere } from '@owlmeans/planning'
import type { Criteria, ListResult } from '@owlmeans/resource'
import { sqlHelper } from '../sql.js'
import type { SqlContext } from '../types.js'
import { linkSqlOf } from './link-sql.js'
import type { LinkPortDeps } from './types.js'

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

export const makeLinkPort = (deps: LinkPortDeps): RelationshipStore => ({
  list: async (where, opts) => {
    await deps.sql()
    const listed = await deps.resource().list(linkCriteria(where), opts)
    return { ...listed, items: listed.items.map(item => sqlHelper.cleanRecord(item)) }
  },

  put: async link => await linkSqlOf(await deps.sql()).putLink(link, deps.ids),

  drop: async where => await linkSqlOf(await deps.sql()).dropLinks(where),
})

/** @deprecated compat:factory-refactor — use `linkSqlOf(sql).listLinks(…)` */
export const listLinks = async (sql: SqlContext, where: RelationshipWhere): Promise<ListResult<Relationship>> =>
  await linkSqlOf(sql).listLinks(where)

/** @deprecated compat:factory-refactor — use `linkSqlOf(sql).putLink(…)` */
export const putLink = async (sql: SqlContext, link: Relationship, id: () => string): Promise<Relationship> =>
  await linkSqlOf(sql).putLink(link, id)

/** @deprecated compat:factory-refactor — use `linkSqlOf(sql).dropLinks(…)` */
export const dropLinks = async (sql: SqlContext, where: RelationshipWhere): Promise<number> =>
  await linkSqlOf(sql).dropLinks(where)
