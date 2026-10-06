import { describe, expect, test } from 'bun:test'
import { UnsupportedArgumentError } from '@owlmeans/resource'
import type { Criteria, Sort } from '@owlmeans/resource'
import type { AnySchema } from 'ajv'
import { sql } from 'drizzle-orm'
import type { SQL } from 'drizzle-orm'
import { PgDialect } from 'drizzle-orm/pg-core'

import { pgCriteriaHelper, pgSchemaHelper, specToTable } from '@owlmeans/postgres-resource'
import type { PgRuntimeTable, TableSpec } from '@owlmeans/postgres-resource'

const { criteriaToSql, sortToSql } = pgCriteriaHelper
const { schemaToTableSpec } = pgSchemaHelper

/**
 * Criteria translation is where a typo becomes either an error or a whole-table scan, and
 * where a value has to stay a bound parameter instead of becoming statement text. Neither
 * question needs a database: the dialect renders a clause exactly as the driver would
 * receive it, so these specs assert on that rendering rather than on query results.
 */

interface Thing {
  id?: string
  email: string
  status?: string
  age?: number
  tags?: string[]
  profile?: Record<string, unknown>
}

/** `email` is renamed on purpose — a clause must name the physical column, never the property. */
const schema = {
  type: 'object',
  properties: {
    id: { type: 'string', format: 'uuid' },
    email: { type: 'string', pg: { column: 'email_address' } },
    status: { type: 'string', nullable: true },
    age: { type: 'integer', nullable: true },
    tags: { type: 'array', items: { type: 'string' }, nullable: true },
    profile: { type: 'object', nullable: true }
  },
  required: ['id', 'email']
} as AnySchema

const spec: TableSpec = schemaToTableSpec('things', schema, 'app', 'things', true)
const table: PgRuntimeTable = specToTable(spec)
const dialect = new PgDialect()

const render = (statement: SQL): { sql: string, params: unknown[] } => {
  const query = dialect.sqlToQuery(statement)

  return { sql: query.sql, params: query.params }
}

const where = (criteria: Criteria<Thing>): { sql: string, params: unknown[] } => {
  const clause = criteriaToSql(criteria, spec, table)
  expect(clause).not.toBeUndefined()

  return render(clause as SQL)
}

const order = (sort?: Sort<Thing>[]): string =>
  render(sql.join(sortToSql(sort, spec, table), sql`, `)).sql

describe('@owlmeans/postgres-resource — criteriaToSql', () => {
  test('reads a bare value as equality, against the physical column', () => {
    const clause = where({ email: 'a@b.c' })

    expect(clause.sql).toContain('"email_address"')
    expect(clause.sql).toContain('=')
    /** The value never reaches the statement text. */
    expect(clause.sql).not.toContain('a@b.c')
    expect(clause.params).toEqual(['a@b.c'])
  })

  test('reads a bare array as membership and null as absence', () => {
    const list = where({ status: ['open', 'done'] })
    expect(list.sql).toContain('IN')
    expect(list.params).toEqual(['open', 'done'])

    expect(where({ status: null }).sql).toContain('IS NULL')
  })

  /** `IN` never matches NULL, so a list carrying one has to be widened explicitly. */
  test('widens a membership list that carries a null', () => {
    const clause = where({ status: { $in: ['open', null] } })

    expect(clause.sql).toContain('IN')
    expect(clause.sql).toContain('IS NULL')
    expect(clause.params).toEqual(['open'])
  })

  /** Postgres rejects an empty `IN ()`, and an empty set matches nothing — or everything, negated. */
  test('collapses a membership list Postgres would reject', () => {
    expect(where({ status: { $in: [] } }).sql).toContain('FALSE')
    expect(where({ status: { $nin: [] } }).sql).toContain('TRUE')
  })

  test('translates the comparison and text operators', () => {
    expect(where({ age: { $gte: 18 } }).params).toEqual([18])
    expect(where({ age: { $between: [18, 65] } }).sql).toContain('BETWEEN')
    expect(where({ email: { $ilike: '%@b.c' } }).sql).toContain('ILIKE')
    expect(where({ email: { $regex: '^a' } }).sql).toContain('~')
    expect(where({ status: { $exists: false } }).sql).toContain('IS NULL')
    expect(where({ status: { $null: false } }).sql).toContain('IS NOT NULL')
  })

  /** A wildcard inside the operand is data, not a pattern the caller wrote. */
  test('escapes the LIKE wildcards in startsWith and endsWith', () => {
    expect(where({ email: { $startsWith: 'a_b' } }).params).toEqual(['a\\_b%'])
    expect(where({ email: { $endsWith: '100%' } }).params).toEqual(['%100\\%'])
  })

  test('composes with $or and $not', () => {
    const clause = where({
      $or: [{ status: 'open' }, { age: { $lt: 18 } }],
      $not: { email: 'a@b.c' }
    })

    expect(clause.sql).toContain(' or ')
    expect(clause.sql).toContain('NOT')
    expect(clause.params).toEqual(['open', 18, 'a@b.c'])
  })

  test('reaches into a jsonb column through a dotted path, compared as typed JSON', () => {
    const clause = where({ 'profile.city': 'Kyiv' })

    /** The path is a bound text[] and the value a bound jsonb literal — neither is statement text. */
    expect(clause.sql).toContain('#> $1::text[]')
    expect(clause.sql).toContain('$2::jsonb')
    expect(clause.params).toEqual([['city'], '"Kyiv"'])

    /** A number or a boolean is compared as itself, never as its text. */
    expect(where({ 'profile.age': 30 } as Criteria<Thing>).params).toEqual([['age'], '30'])
    expect(where({ 'profile.verified': true } as Criteria<Thing>).params).toEqual([['verified'], 'true'])
  })

  test('reads a dotted array as membership, null as absence, and operators as they read on a column', () => {
    const list = where({ 'profile.tier': ['gold', 'silver'] } as Criteria<Thing>)
    expect(list.sql).toContain('= ANY(ARRAY[')
    expect(list.sql).toContain(']::jsonb[])')
    expect(list.params).toEqual([['tier'], '"gold"', '"silver"'])

    const absent = where({ 'profile.tier': null } as Criteria<Thing>)
    expect(absent.sql).toContain('IS NULL')
    expect(absent.sql).toContain(`'null'::jsonb`)

    const widened = where({ 'profile.tier': { $in: ['gold', null] } } as Criteria<Thing>)
    expect(widened.sql).toContain('= ANY(ARRAY[')
    expect(widened.sql).toContain('IS NULL')

    expect(where({ 'profile.age': { $gte: 18 } } as Criteria<Thing>).sql).toContain('>= $2::jsonb')
    expect(where({ 'profile.city': { $ilike: 'ky%' } } as Criteria<Thing>).sql).toContain('#>> $1::text[]) ILIKE')
    expect(where({ 'profile.city': { $exists: true } } as Criteria<Thing>).sql).toMatch(/^NOT \(.* IS NULL OR .* = 'null'::jsonb\)$/)
    expect(where({ 'profile.tags': { $contains: 'a' } } as Criteria<Thing>).params).toEqual([['tags'], '["a"]'])
    /** A path segment holding a comma or a brace stays one segment. */
    expect(where({ 'profile.a,b': 1 } as Criteria<Thing>).params).toEqual([['a,b'], '1'])
  })

  test('binds an array operand of a native array column as ONE array parameter, wrapping a scalar', () => {
    const scalar = where({ tags: { $contains: 'rare' } })
    expect(scalar.sql).toContain('"tags" @> $1::text[]')
    expect(scalar.params).toEqual([['rare']])

    const many = where({ tags: { $overlaps: ['rare', 'new'] } })
    expect(many.sql).toContain('"tags" && $1::text[]')
    expect(many.params).toEqual([['rare', 'new']])

    expect(where({ tags: { $contained: ['rare', 'new'] } }).sql).toContain('<@ $1::text[]')
  })

  test('reads jsonb array operators as JSON containment, and overlap element by element', () => {
    const contains = where({ profile: { $contains: 'rare' } })
    expect(contains.sql).toContain('"profile" @> $1::jsonb')
    expect(contains.params).toEqual(['["rare"]'])

    const overlaps = where({ profile: { $overlaps: ['rare', 2] } })
    expect(overlaps.sql).toContain('jsonb_array_elements')
    expect(overlaps.params).toEqual(['"rare"', '2', '"rare"', '2'])
  })

  test('matches a jsonb column against a whole object with containment', () => {
    const bare = where({ profile: { city: 'Kyiv' } })
    expect(bare.sql).toContain('@>')
    /** A jsonb operand is stringified on the way out; the driver would send an object as text. */
    expect(bare.params).toEqual(['{"city":"Kyiv"}'])

    expect(where({ profile: { $contains: { city: 'Kyiv' } } }).sql).toContain('@>')
  })

  /** An unset filter must not empty the list it filters. */
  test('skips an undefined value and answers nothing at all for an empty criteria', () => {
    expect(criteriaToSql({ status: undefined }, spec, table)).toBeUndefined()
    expect(criteriaToSql({}, spec, table)).toBeUndefined()
    expect(criteriaToSql(undefined, spec, table)).toBeUndefined()
  })

  /** A typo silently widening a query to the whole table is worth being loud about. */
  test('refuses an unknown key, an unknown operator and a path into a plain column', () => {
    expect(() => criteriaToSql({ nope: 'x' } as unknown as Criteria<Thing>, spec, table))
      .toThrow(UnsupportedArgumentError)
    expect(() => criteriaToSql({ status: { $near: 'x' } } as unknown as Criteria<Thing>, spec, table))
      .toThrow(UnsupportedArgumentError)
    expect(() => criteriaToSql({ 'email.local': 'a' }, spec, table))
      .toThrow(UnsupportedArgumentError)
  })
})

describe('@owlmeans/postgres-resource — sortToSql', () => {
  test('sorts a bare field name ascending', () => {
    expect(order(['email'])).toContain('"email_address" asc')
  })

  test('reverses on order: desc', () => {
    expect(order([{ field: 'email', order: 'desc' }])).toContain('"email_address" desc')
    /** `{ field }` alone means the same as the bare name. */
    expect(order([{ field: 'email' }])).toContain('"email_address" asc')
  })

  /**
   * Postgres has no implicit row order, so paginating on a non-unique key would silently
   * duplicate and skip rows between pages.
   */
  test('appends the primary key as a tiebreak, exactly once', () => {
    const byStatus = order(['status'])
    expect(byStatus).toContain('"status" asc')
    expect(byStatus.split('"id" asc')).toHaveLength(2)

    expect(order()).toContain('"id" asc')
    /** Naming the key itself must not order by it twice. */
    expect(order(['id']).split('"id" asc')).toHaveLength(2)
  })

  test('refuses a field the table does not have', () => {
    expect(() => sortToSql(['nope'] as unknown as Sort<Thing>[], spec, table))
      .toThrow(UnsupportedArgumentError)
    /** ORDER BY cannot reach into jsonb the way a criteria path can. */
    expect(() => sortToSql(['profile.city'], spec, table)).toThrow(UnsupportedArgumentError)
  })
})
