import { UnsupportedArgumentError } from '@owlmeans/resource'
import type { ListCriteria, ListSort } from '@owlmeans/resource'
import { and, asc, desc, or, sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'

import type { ColumnSpec, PgRuntimeTable, TableSpec } from '../types.js'

const COMPARISON: Record<string, string> = {
  $eq: '=', $ne: '<>', $gt: '>', $gte: '>=', $lt: '<', $lte: '<='
}

const columnRef = (table: PgRuntimeTable, column: ColumnSpec): SQL => sql`${table[column.property]}`

const value = (raw: unknown, column: ColumnSpec): SQL => {
  if (column.jsonb && raw != null && typeof raw !== 'string') {
    return sql`${JSON.stringify(raw)}`
  }

  return sql`${raw}`
}

const inList = (table: PgRuntimeTable, column: ColumnSpec, values: unknown[], negate: boolean): SQL => {
  const present = values.filter(entry => entry != null)
  const hasNull = present.length !== values.length

  if (present.length < 1) {
    /** Postgres rejects an empty `IN ()`, and an empty set matches nothing (or everything, negated). */
    return hasNull
      ? sql`${columnRef(table, column)} IS ${negate ? sql`NOT` : sql``} NULL`
      : negate ? sql`TRUE` : sql`FALSE`
  }

  const list = sql.join(present.map(entry => value(entry, column)), sql`, `)
  const membership = negate
    ? sql`${columnRef(table, column)} NOT IN (${list})`
    : sql`${columnRef(table, column)} IN (${list})`

  if (!hasNull) {
    return membership
  }
  /**
   * `IN` never matches NULL, so `{ $in: [null, 'x'] }` — a real shape in this codebase —
   * has to be widened explicitly or the null branch silently disappears.
   */
  return negate
    ? sql`(${membership} AND ${columnRef(table, column)} IS NOT NULL)`
    : sql`(${membership} OR ${columnRef(table, column)} IS NULL)`
}

const operators = (
  table: PgRuntimeTable, column: ColumnSpec, spec: Record<string, unknown>
): SQL[] => {
  const conditions: SQL[] = []
  for (const [operator, operand] of Object.entries(spec)) {
    if (operator in COMPARISON) {
      conditions.push(operand == null
        ? sql`${columnRef(table, column)} IS ${operator === '$ne' ? sql`NOT` : sql``} NULL`
        : sql`${columnRef(table, column)} ${sql.raw(COMPARISON[operator])} ${value(operand, column)}`)
      continue
    }
    switch (operator) {
      case '$in':
      case '$nin':
        conditions.push(inList(table, column, Array.isArray(operand) ? operand : [operand], operator === '$nin'))
        break
      case '$exists':
        conditions.push(operand === false
          ? sql`${columnRef(table, column)} IS NULL`
          : sql`${columnRef(table, column)} IS NOT NULL`)
        break
      case '$null':
        conditions.push(operand === false
          ? sql`${columnRef(table, column)} IS NOT NULL`
          : sql`${columnRef(table, column)} IS NULL`)
        break
      case '$like':
        conditions.push(sql`${columnRef(table, column)} LIKE ${operand}`)
        break
      case '$ilike':
        conditions.push(sql`${columnRef(table, column)} ILIKE ${operand}`)
        break
      case '$regex':
        conditions.push(sql`${columnRef(table, column)} ~ ${operand}`)
        break
      case '$startsWith':
        conditions.push(sql`${columnRef(table, column)} LIKE ${`${escapeLike(`${operand}`)}%`}`)
        break
      case '$endsWith':
        conditions.push(sql`${columnRef(table, column)} LIKE ${`%${escapeLike(`${operand}`)}`}`)
        break
      case '$between': {
        if (!Array.isArray(operand) || operand.length !== 2) {
          throw new UnsupportedArgumentError(`criteria:$between:${column.property}`)
        }
        conditions.push(
          sql`${columnRef(table, column)} BETWEEN ${value(operand[0], column)} AND ${value(operand[1], column)}`
        )
        break
      }
      case '$contains':
        conditions.push(sql`${columnRef(table, column)} @> ${value(operand, column)}`)
        break
      case '$contained':
        conditions.push(sql`${columnRef(table, column)} <@ ${value(operand, column)}`)
        break
      case '$overlaps':
        conditions.push(sql`${columnRef(table, column)} && ${value(operand, column)}`)
        break
      default:
        throw new UnsupportedArgumentError(`criteria-operator:${operator}`)
    }
  }

  return conditions
}

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, match => `\\${match}`)

const isOperatorSpec = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
  && Object.keys(value).some(key => key.startsWith('$'))

/**
 * Translate `ListCriteria` into a WHERE clause.
 *
 * An unknown key raises rather than being skipped: a typo silently widening a query to
 * the whole table is the failure mode worth being loud about.
 *
 * @throws {UnsupportedArgumentError}
 */
export const criteriaToSql = (
  criteria: ListCriteria | undefined, spec: TableSpec, table: PgRuntimeTable
): SQL | undefined => {
  const conditions = build(criteria, spec, table)

  return conditions.length > 0 ? and(...conditions) : undefined
}

const build = (
  criteria: ListCriteria | undefined, spec: TableSpec, table: PgRuntimeTable
): SQL[] => {
  const conditions: SQL[] = []
  for (const [key, raw] of Object.entries(criteria ?? {})) {
    if (raw === undefined) {
      continue
    }

    if (key === '$and' || key === '$or') {
      const parts = (Array.isArray(raw) ? raw : [raw])
        .map(entry => and(...build(entry as ListCriteria, spec, table)))
        .filter((entry): entry is SQL => entry != null)
      if (parts.length > 0) {
        const combined = key === '$and' ? and(...parts) : or(...parts)
        if (combined != null) {
          conditions.push(combined)
        }
      }
      continue
    }
    if (key === '$not') {
      const inner = and(...build(raw as ListCriteria, spec, table))
      if (inner != null) {
        conditions.push(sql`NOT (${inner})`)
      }
      continue
    }

    /** `profile.city` reaches into a jsonb column rather than naming a column. */
    const [head, ...path] = key.split('.')
    const column = spec.byProperty[head]
    if (column == null) {
      throw new UnsupportedArgumentError(`criteria:${key}`)
    }
    if (path.length > 0) {
      if (!column.jsonb) {
        throw new UnsupportedArgumentError(`criteria-path:${key}`)
      }
      conditions.push(sql`${columnRef(table, column)} #>> ${`{${path.join(',')}}`} = ${`${raw}`}`)
      continue
    }

    if (raw === null) {
      conditions.push(sql`${columnRef(table, column)} IS NULL`)
      continue
    }
    if (isOperatorSpec(raw)) {
      conditions.push(...operators(table, column, raw as Record<string, unknown>))
      continue
    }
    if (Array.isArray(raw)) {
      /**
       * A bare array means `IN` for a relational store, which is overwhelmingly the intent.
       * Exact array equality against a `text[]` column stays available as `{ $eq: [...] }`.
       */
      conditions.push(inList(table, column, raw, false))
      continue
    }
    if (column.jsonb && typeof raw === 'object') {
      conditions.push(sql`${columnRef(table, column)} @> ${JSON.stringify(raw)}`)
      continue
    }
    conditions.push(sql`${columnRef(table, column)} = ${value(raw, column)}`)
  }

  return conditions
}

/**
 * Translate `ListPager.sort` into ORDER BY. `[field, true]` is descending, matching the
 * `order ? -1 : 1` mapping mongo uses.
 *
 * The primary key is always appended as a tiebreak. Postgres has no implicit row order, so
 * paginating on a non-unique sort key silently duplicates and skips rows between pages —
 * a difference from mongo that would otherwise surface as a data bug rather than an error.
 *
 * @throws {UnsupportedArgumentError}
 */
export const sortToSql = (
  sort: ListSort[] | undefined, spec: TableSpec, table: PgRuntimeTable
): SQL[] => {
  const order: SQL[] = []
  const seen: string[] = []

  for (const entry of sort ?? []) {
    /** Both `ListSort` forms are handled explicitly — destructuring a plain string yields characters. */
    const [property, descending] = typeof entry === 'string' ? [entry, false] : [entry[0], entry[1] === true]
    const column = spec.byProperty[property]
    if (column == null) {
      throw new UnsupportedArgumentError(`sort:${property}`)
    }
    seen.push(column.column)
    order.push(descending ? desc(table[column.property]) : asc(table[column.property]))
  }

  for (const key of spec.primaryKey) {
    if (seen.includes(key)) {
      continue
    }
    const column = spec.byColumn[key]
    if (column != null) {
      order.push(asc(table[column.property]))
    }
  }

  return order
}
