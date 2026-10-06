import { IntrinsicStatus, PlanningError, type ProjectionStore, type SummaryView, type Workcard } from '@owlmeans/planning'
import type { Criteria } from '@owlmeans/resource'
import { wantsSpecifications } from '@owlmeans/server-planning/store'
import { sqlHelper } from '../sql.js'
import type { SqlContext, PlanningCardRecord } from '../types.js'
import { cardSqlOf } from './card-sql.js'
import { NOT_SPECIFICATION } from './consts.local.js'
import { CARD_PRIVATE } from './consts.js'
import type { CardPortDeps } from './types.js'

const and = (where: Criteria<Workcard> | undefined, ...extra: Criteria<Workcard>[]): Criteria<Workcard> => {
  const base = (where ?? {}) as Criteria<Workcard> & { $and?: Criteria<Workcard>[] }
  return { ...base, $and: [...(base.$and ?? []), ...extra] } as Criteria<Workcard>
}

/** A card list names specifications only when it asks for them — the rule every store keeps. */
export const routedCriteria = (where?: Criteria<Workcard>): Criteria<Workcard> =>
  wantsSpecifications(where) ? (where ?? {}) as Criteria<Workcard> : and(where, NOT_SPECIFICATION)

const emptyCounts = () => ({
  total: 0, [IntrinsicStatus.Planned]: 0, [IntrinsicStatus.InProgress]: 0, [IntrinsicStatus.Closed]: 0,
})

/**
 * The projection port. Point reads and writes are this package's own statements; lists, counts and
 * summaries go through the resource, so a criteria means here what it means everywhere
 * (`criteriaToSql`).
 */
export const makeCardPort = (deps: CardPortDeps): ProjectionStore => ({
  get: async (id, entityId) => await cardSqlOf(await deps.sql()).readCard(id, entityId),

  list: async (where, opts) => {
    await deps.sql()
    const listed = await deps.resource().list(routedCriteria(where) as Criteria<PlanningCardRecord>, opts as never)
    return { ...listed, items: listed.items.map(item => sqlHelper.cleanRecord(item, CARD_PRIVATE) as Workcard) }
  },

  count: async where => {
    await deps.sql()
    return await deps.resource().count(routedCriteria(where) as Criteria<PlanningCardRecord>)
  },

  summary: async (parents, where) => {
    if (parents.length === 0) {
      return {}
    }
    await deps.sql()
    const rows = await deps.resource().countBy(
      and(where, NOT_SPECIFICATION, { parent: parents } as Criteria<Workcard>) as Criteria<PlanningCardRecord>,
      ['parent', 'intrinsic']
    )
    return rows.reduce<SummaryView>((view, row) => {
      const parent = row.parent as string
      const counts = view[parent] ?? emptyCounts()
      counts.total += row.count
      counts[row.intrinsic as IntrinsicStatus] = (counts[row.intrinsic as IntrinsicStatus] ?? 0) + row.count
      view[parent] = counts
      return view
    }, {})
  },

  put: async card => { await cardSqlOf(await deps.sql()).writeCard(card) },

  drop: async (id, entityId) => { await cardSqlOf(await deps.sql()).dropCard(id, entityId) },

  project: async card => { await deps.project(card) },

  purge: async (project, entityId) => {
    if (project == null || project === '') {
      throw new PlanningError('purge:empty')
    }
    return await deps.purge(project, entityId)
  },
})

/** @deprecated compat:factory-refactor — use `cardSqlOf(sql).readCardRow(…)` */
export const readCardRow = async (sql: SqlContext, id: string, entityId?: string): Promise<PlanningCardRecord | null> =>
  await cardSqlOf(sql).readCardRow(id, entityId)

/** @deprecated compat:factory-refactor — use `cardSqlOf(sql).readCard(…)` */
export const readCard = async (sql: SqlContext, id: string, entityId: string): Promise<Workcard | null> =>
  await cardSqlOf(sql).readCard(id, entityId)

/** @deprecated compat:factory-refactor — use `cardSqlOf(sql).writeCard(…)` */
export const writeCard = async (sql: SqlContext, card: Workcard): Promise<void> => await cardSqlOf(sql).writeCard(card)

/** @deprecated compat:factory-refactor — use `cardSqlOf(sql).dropCard(…)` */
export const dropCard = async (sql: SqlContext, id: string, entityId: string): Promise<void> =>
  await cardSqlOf(sql).dropCard(id, entityId)
