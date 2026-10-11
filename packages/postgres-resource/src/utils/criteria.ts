import { UnsupportedArgumentError, type Criteria, type FieldOperators, type Sort } from '@owlmeans/resource'
import { and, asc, desc, or, param, sql, type SQL } from 'drizzle-orm'

import type { ColumnSpec, PgRuntimeTable, TableSpec } from '../types.js'
import { COMPARISON } from './consts.local.js'
import type { PathTarget } from './types.local.js'
import type { PgCriteriaHelper } from './criteria/types.js'

const columnRef = (table: PgRuntimeTable, column: ColumnSpec): SQL => sql`${table[column.property]}`

const value = (raw: unknown, column: ColumnSpec): SQL => {
  if (column.jsonb && raw != null && typeof raw !== 'string') {
    return sql`${JSON.stringify(raw)}`
  }

  return sql`${raw}`
}

/** The operand of an array operator as a list — a scalar is the list of itself. */
const listOf = (operand: unknown): unknown[] => Array.isArray(operand) ? operand : [operand]

const isPlainObject = (raw: unknown): raw is Record<string, unknown> =>
  raw != null && typeof raw === 'object' && !Array.isArray(raw) && !(raw instanceof Date)

/** A JSON value as a bound `jsonb` literal. */
const json = (raw: unknown): SQL => sql`${JSON.stringify(raw instanceof Date ? raw.toISOString() : raw)}::jsonb`

/** `ARRAY[$1, $2]::jsonb[]` — one bound JSON literal per value. */
const jsonList = (values: unknown[]): SQL => values.length === 0
  ? sql`ARRAY[]::jsonb[]`
  : sql`ARRAY[${sql.join(values.map(entry => sql`${JSON.stringify(entry instanceof Date ? entry.toISOString() : entry)}`), sql`, `)}]::jsonb[]`

/**
 * `@>` / `<@` against a jsonb value: an object is contained as an object, anything else as the
 * JSON array it is (or the array of the one value it is).
 */
const jsonContainment = (target: SQL, operator: '@>' | '<@', operand: unknown): SQL =>
  sql`${target} ${sql.raw(operator)} ${json(isPlainObject(operand) ? operand : listOf(operand))}`

/**
 * `&&` has no jsonb form: an array value overlaps when one of its elements is one of the operands,
 * and a scalar value — like every other store reads it — when it is one of them.
 */
const jsonOverlap = (target: SQL, operand: unknown): SQL => {
  const values = listOf(operand)
  return sql`(CASE WHEN jsonb_typeof(${target}) = 'array' THEN EXISTS (SELECT 1 FROM jsonb_array_elements(${target}) AS element WHERE element = ANY(${jsonList(values)})) ELSE ${target} = ANY(${jsonList(values)}) END)`
}

/**
 * `@>` / `<@` / `&&` on a column. A native array column takes ONE bound array parameter cast to the
 * column's own type (a bare JS array in a template would expand into a row constructor), a jsonb
 * column takes JSON, and a scalar operand is the one-element list either way.
 */
const arrayOperator = (
  table: PgRuntimeTable, column: ColumnSpec, operator: '$contains' | '$contained' | '$overlaps', operand: unknown
): SQL => {
  const target = columnRef(table, column)
  if (column.jsonb) {
    return operator === '$overlaps'
      ? jsonOverlap(target, operand)
      : jsonContainment(target, operator === '$contains' ? '@>' : '<@', operand)
  }
  const symbol = sql.raw(operator === '$contains' ? '@>' : operator === '$contained' ? '<@' : '&&')
  if (column.array) {
    return sql`${target} ${symbol} ${param(listOf(operand))}::${sql.raw(column.sqlType)}`
  }

  return sql`${target} ${symbol} ${value(operand, column)}`
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
  table: PgRuntimeTable, column: ColumnSpec, spec: FieldOperators<any>
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
      case '$contained':
      case '$overlaps':
        conditions.push(arrayOperator(table, column, operator, operand))
        break
      default:
        throw new UnsupportedArgumentError(`criteria-operator:${operator}`)
    }
  }

  return conditions
}

const escapeLike = (value: string): string => value.replace(/[\\%_]/g, match => `\\${match}`)

// ─── Dotted paths into a jsonb column ────────────────────────────────────────────────────────────

const pathTarget = (table: PgRuntimeTable, column: ColumnSpec, path: string[]): PathTarget => {
  const value = sql`(${columnRef(table, column)} #> ${param(path)}::text[])`

  return {
    value,
    text: sql`(${columnRef(table, column)} #>> ${param(path)}::text[])`,
    missing: sql`(${value} IS NULL OR ${value} = 'null'::jsonb)`,
  }
}

/** `$in` / `$nin` / a bare list at a path — the column rules: a `null` entry widens to absence. */
const pathList = (target: PathTarget, values: unknown[], negate: boolean): SQL => {
  const present = values.filter(entry => entry != null)
  const hasNull = present.length !== values.length

  if (present.length < 1) {
    return hasNull
      ? negate ? sql`NOT ${target.missing}` : target.missing
      : negate ? sql`TRUE` : sql`FALSE`
  }
  const membership = sql`${target.value} = ANY(${jsonList(present)})`
  if (negate) {
    return sql`(NOT ${target.missing} AND NOT (${membership}))`
  }

  return hasNull ? sql`(${membership} OR ${target.missing})` : membership
}

/** The operators at a path, each read as the same operator reads on a column. */
const pathOperators = (target: PathTarget, spec: FieldOperators<any>, key: string): SQL[] => {
  const conditions: SQL[] = []
  for (const [operator, operand] of Object.entries(spec)) {
    if (operator in COMPARISON) {
      conditions.push(operand == null
        ? operator === '$ne' ? sql`NOT ${target.missing}` : target.missing
        : sql`${target.value} ${sql.raw(COMPARISON[operator])} ${json(operand)}`)
      continue
    }
    switch (operator) {
      case '$in':
      case '$nin':
        conditions.push(pathList(target, listOf(operand), operator === '$nin'))
        break
      case '$exists':
        conditions.push(operand === false ? target.missing : sql`NOT ${target.missing}`)
        break
      case '$null':
        conditions.push(operand === false ? sql`NOT ${target.missing}` : target.missing)
        break
      case '$like':
        conditions.push(sql`${target.text} LIKE ${operand}`)
        break
      case '$ilike':
        conditions.push(sql`${target.text} ILIKE ${operand}`)
        break
      case '$regex':
        conditions.push(sql`${target.text} ~ ${operand}`)
        break
      case '$startsWith':
        conditions.push(sql`${target.text} LIKE ${`${escapeLike(`${operand}`)}%`}`)
        break
      case '$endsWith':
        conditions.push(sql`${target.text} LIKE ${`%${escapeLike(`${operand}`)}`}`)
        break
      case '$between': {
        if (!Array.isArray(operand) || operand.length !== 2) {
          throw new UnsupportedArgumentError(`criteria:$between:${key}`)
        }
        conditions.push(sql`${target.value} BETWEEN ${json(operand[0])} AND ${json(operand[1])}`)
        break
      }
      case '$contains':
        conditions.push(jsonContainment(target.value, '@>', operand))
        break
      case '$contained':
        conditions.push(jsonContainment(target.value, '<@', operand))
        break
      case '$overlaps':
        conditions.push(jsonOverlap(target.value, operand))
        break
      default:
        throw new UnsupportedArgumentError(`criteria-operator:${operator}`)
    }
  }

  return conditions
}

/**
 * A criteria value at a dotted path, with the meaning it has on a column: a bare value is typed
 * JSON equality (a number is not its text), a bare list is membership, `null` is absence, an object
 * of operators applies each, and a plain object is containment.
 */
const pathCondition = (target: PathTarget, raw: unknown, key: string): SQL[] => {
  if (raw === null) {
    return [target.missing]
  }
  if (isOperatorSpec(raw)) {
    return pathOperators(target, raw, key)
  }
  if (Array.isArray(raw)) {
    return [pathList(target, raw, false)]
  }
  if (isPlainObject(raw)) {
    return [jsonContainment(target.value, '@>', raw)]
  }

  return [sql`${target.value} = ${json(raw)}`]
}

/**
 * An object naming at least one `$` key is a spec, not a value to compare against.
 * A Date and an array are values even though both are objects.
 */
const isOperatorSpec = (value: unknown): value is FieldOperators<any> =>
  value != null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)
  && Object.keys(value).some(key => key.startsWith('$'))

export const createPgCriteriaHelper = (): PgCriteriaHelper => {
  const criteriaToSql = <T>(
    criteria: Criteria<T> | undefined, spec: TableSpec, table: PgRuntimeTable
  ): SQL | undefined => {
    const conditions = build(criteria, spec, table)

    return conditions.length > 0 ? and(...conditions) : undefined
  }

  const build = <T>(
    criteria: Criteria<T> | undefined, spec: TableSpec, table: PgRuntimeTable
  ): SQL[] => {
    const conditions: SQL[] = []
    for (const [key, raw] of Object.entries(criteria ?? {})) {
      if (raw === undefined) {
        continue
      }

      if (key === '$and' || key === '$or') {
        const parts = (Array.isArray(raw) ? raw : [raw])
          .map(entry => and(...build(entry as Criteria<T>, spec, table)))
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
        const inner = and(...build(raw as Criteria<T>, spec, table))
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
        conditions.push(...pathCondition(pathTarget(table, column, path), raw, key))
        continue
      }

      if (raw === null) {
        conditions.push(sql`${columnRef(table, column)} IS NULL`)
        continue
      }
      if (isOperatorSpec(raw)) {
        conditions.push(...operators(table, column, raw))
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

  const sortToSql = <T>(
    sort: Sort<T>[] | undefined, spec: TableSpec, table: PgRuntimeTable
  ): SQL[] => {
    const order: SQL[] = []
    const seen: string[] = []

    for (const entry of sort ?? []) {
      const property = typeof entry === 'string' ? entry : entry.field
      const descending = typeof entry !== 'string' && entry.order === 'desc'
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

  return { criteriaToSql, sortToSql }
}

export const pgCriteriaHelper = createPgCriteriaHelper()
