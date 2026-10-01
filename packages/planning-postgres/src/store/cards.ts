import { IntrinsicStatus, PlanningError, WorkcardKind } from '@owlmeans/planning'
import type { ProjectionStore, SummaryView, Workcard } from '@owlmeans/planning'
import { quoteIdent } from '@owlmeans/postgres-resource'
import type { Criteria } from '@owlmeans/resource'
import { wantsSpecifications } from '@owlmeans/server-planning/store'
import { PlanningPostgresError } from '../errors.js'
import { cleanRecord, col, driverValue, insertOf, recordOf } from '../sql.js'
import type { SqlContext } from '../sql.js'
import type { PlanningCardRecord, PlanningCardResource } from '../types.js'

/** Columns no caller ever sees. */
export const CARD_PRIVATE = ['headAt'] as const

const and = (where: Criteria<Workcard> | undefined, ...extra: Criteria<Workcard>[]): Criteria<Workcard> => {
  const base = (where ?? {}) as Criteria<Workcard> & { $and?: Criteria<Workcard>[] }
  return { ...base, $and: [...(base.$and ?? []), ...extra] } as Criteria<Workcard>
}

const NOT_SPECIFICATION = { kind: { $ne: WorkcardKind.Specification } } as Criteria<Workcard>

/** A card list names specifications only when it asks for them — the rule every store keeps. */
export const routedCriteria = (where?: Criteria<Workcard>): Criteria<Workcard> =>
  wantsSpecifications(where) ? (where ?? {}) as Criteria<Workcard> : and(where, NOT_SPECIFICATION)

/** A card row with its private bookkeeping (what the fold reads), or `null`. */
export const readCardRow = async (sql: SqlContext, id: string, entityId?: string): Promise<PlanningCardRecord | null> => {
  const spec = sql.tables.card
  const rows = await sql.runner.query(
    `SELECT * FROM ${spec.qualified} WHERE ${col(spec, 'id')} = $1${entityId != null ? ` AND ${col(spec, 'entityId')} = $2` : ''}`,
    entityId != null ? [id, entityId] : [id]
  )
  return rows[0] == null ? null : recordOf<PlanningCardRecord>(rows[0], spec)
}

export const readCard = async (sql: SqlContext, id: string, entityId: string): Promise<Workcard | null> => {
  const row = await readCardRow(sql, id, entityId)
  return row == null ? null : cleanRecord(row, CARD_PRIVATE)
}

/**
 * Write a folded card whole. `head` is never lowered — an allocation made while the fold ran stays
 * — and `headAt` is never touched.
 *
 * A create (`seq` 1) is an upsert. Anything later is an UPDATE of a row that must still exist: a
 * card purged with its project while one of its own transitions was folding is not resurrected.
 *
 * @throws {PlanningPostgresError} `fold:card-vanished:<id>`
 */
export const writeCard = async (sql: SqlContext, card: Workcard): Promise<void> => {
  const spec = sql.tables.card
  if (card.id == null) {
    throw new PlanningPostgresError('malformed:put-without-id')
  }
  const record = { ...card, head: Math.max(card.head ?? card.seq, card.seq) } as Record<string, unknown>
  const head = col(spec, 'head')
  const seq = col(spec, 'seq')
  const assigned = spec.columns
    .filter(column => !['id', 'headAt', 'head'].includes(column.property))
    .map(column => column.column)

  if (card.seq <= 1) {
    const insert = insertOf(spec, record, {
      skip: CARD_PRIVATE,
      as: 'existing',
      tail: `ON CONFLICT (${col(spec, 'id')}) DO UPDATE SET `
        + [...assigned.map(name => `${quoteIdent(name)} = EXCLUDED.${quoteIdent(name)}`),
          `${head} = GREATEST(COALESCE(existing.${head}, existing.${seq}), EXCLUDED.${head})`].join(', '),
    })
    await sql.runner.query(insert.text, insert.params)
    return
  }

  const columns = spec.columns.filter(column => assigned.includes(column.column))
  const params = [card.id, ...columns.map(column => driverValue(column, record[column.property])), record.head]
  const updated = await sql.runner.query(
    `UPDATE ${spec.qualified} SET ${columns.map((column, index) => `${quoteIdent(column.column)} = $${index + 2}`).join(', ')},`
    + ` ${head} = GREATEST(COALESCE(${head}, ${seq}), $${columns.length + 2}) WHERE ${col(spec, 'id')} = $1 RETURNING ${col(spec, 'id')}`,
    params
  )
  if (updated.length === 0) {
    throw new PlanningPostgresError(`fold:card-vanished:${card.id}`)
  }
}

export const dropCard = async (sql: SqlContext, id: string, entityId: string): Promise<void> => {
  const spec = sql.tables.card
  await sql.runner.query(
    `DELETE FROM ${spec.qualified} WHERE ${col(spec, 'id')} = $1 AND ${col(spec, 'entityId')} = $2`, [id, entityId]
  )
}

const emptyCounts = () => ({
  total: 0, [IntrinsicStatus.Planned]: 0, [IntrinsicStatus.InProgress]: 0, [IntrinsicStatus.Closed]: 0,
})

export interface CardPortDeps {
  sql: () => Promise<SqlContext>
  resource: () => PlanningCardResource
  project: (card: string) => Promise<void>
  purge: (project: string, entityId: string) => Promise<number>
}

/**
 * The projection port. Point reads and writes are this package's own statements; lists, counts and
 * summaries go through the resource, so a criteria means here what it means everywhere
 * (`criteriaToSql`).
 */
export const makeCardPort = (deps: CardPortDeps): ProjectionStore => ({
  get: async (id, entityId) => await readCard(await deps.sql(), id, entityId),

  list: async (where, opts) => {
    await deps.sql()
    const listed = await deps.resource().list(routedCriteria(where) as Criteria<PlanningCardRecord>, opts as never)
    return { ...listed, items: listed.items.map(item => cleanRecord(item, CARD_PRIVATE) as Workcard) }
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

  put: async card => { await writeCard(await deps.sql(), card) },

  drop: async (id, entityId) => { await dropCard(await deps.sql(), id, entityId) },

  project: async card => { await deps.project(card) },

  purge: async (project, entityId) => {
    if (project == null || project === '') {
      throw new PlanningError('purge:empty')
    }
    return await deps.purge(project, entityId)
  },
})
