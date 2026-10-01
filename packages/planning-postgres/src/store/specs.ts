import { listOptionsOf, specCriteriaOf, WorkcardKind } from '@owlmeans/planning'
import type { Specification, SpecificationStore } from '@owlmeans/planning'
import { applyQuery } from '@owlmeans/resource'
import type { Criteria } from '@owlmeans/resource'
import { revisionsFromLog } from '@owlmeans/server-planning/store'
import { cleanRecord, col, recordOf } from '../sql.js'
import type { SqlContext } from '../sql.js'
import type { PlanningCardRecord, PlanningCardResource } from '../types.js'
import { CARD_PRIVATE } from './cards.js'
import { listTransitions } from './transitions.js'

/** The current document of a slot is the highest revision, then the most recently updated. */
const currentOrder = (sql: SqlContext): string => {
  const spec = sql.tables.card
  return `COALESCE(${col(spec, 'revision')}, 0) DESC, COALESCE(${col(spec, 'updatedAt')}, ${col(spec, 'createdAt')}) DESC, ${col(spec, 'id')}`
}

const specOf = (row: Record<string, unknown>, sql: SqlContext): Specification =>
  cleanRecord(recordOf<PlanningCardRecord>(row, sql.tables.card), CARD_PRIVATE) as unknown as Specification

export interface SpecPortDeps {
  sql: () => Promise<SqlContext>
  resource: () => PlanningCardResource
}

/** Specifications are rows of the card table (`kind: 'specification'`), read per parent and slot. */
export const makeSpecPort = (deps: SpecPortDeps): SpecificationStore => ({
  current: async (parent, category, entityId) => {
    const sql = await deps.sql()
    const spec = sql.tables.card
    const rows = await sql.runner.query(
      `SELECT * FROM ${spec.qualified} WHERE ${col(spec, 'entityId')} = $1 AND ${col(spec, 'kind')} = $2`
      + ` AND ${col(spec, 'parent')} = $3 AND ${col(spec, 'category')} = $4 ORDER BY ${currentOrder(sql)} LIMIT 1`,
      [entityId, WorkcardKind.Specification, parent, category]
    )
    return rows[0] == null ? null : specOf(rows[0], sql)
  },

  list: async (parent, entityId, query) => {
    const sql = await deps.sql()
    if (query?.all === true) {
      const listed = await deps.resource().list(
        specCriteriaOf(parent, query, { entityId }) as unknown as Criteria<PlanningCardRecord>, listOptionsOf(query) as never
      )
      return { ...listed, items: listed.items.map(item => cleanRecord(item, CARD_PRIVATE) as unknown as Specification) }
    }
    const spec = sql.tables.card
    const categories = query?.category == null ? undefined : Array.isArray(query.category) ? query.category : [query.category]
    const rows = await sql.runner.query(
      `SELECT DISTINCT ON (${col(spec, 'category')}) * FROM ${spec.qualified}`
      + ` WHERE ${col(spec, 'entityId')} = $1 AND ${col(spec, 'kind')} = $2 AND ${col(spec, 'parent')} = $3`
      + `${categories != null ? ` AND ${col(spec, 'category')} = ANY($4)` : ''}`
      + ` ORDER BY ${col(spec, 'category')}, ${currentOrder(sql)}`,
      categories != null ? [entityId, WorkcardKind.Specification, parent, categories] : [entityId, WorkcardKind.Specification, parent]
    )
    // One current document per category is a small set: its paging and sorting are the shared engine's.
    return applyQuery(rows.map(row => specOf(row, sql)), undefined, listOptionsOf(query))
  },

  revisions: async (id, entityId, limit) => {
    const sql = await deps.sql()
    const spec = sql.tables.card
    const found = await sql.runner.query(
      `SELECT ${col(spec, 'id')} FROM ${spec.qualified} WHERE ${col(spec, 'id')} = $1 AND ${col(spec, 'entityId')} = $2 AND ${col(spec, 'kind')} = $3`,
      [id, entityId, WorkcardKind.Specification]
    )
    if (found.length === 0) {
      return []
    }
    return revisionsFromLog((await listTransitions(sql, { entityId, card: id })).items, limit)
  },
})
