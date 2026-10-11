import { describe, expect, test } from 'bun:test'
import type { BasicContext } from '@owlmeans/context'

import { pgPlaceholdersOf, pgSchemaHelper, PostgresPlaceholderError } from '@owlmeans/postgres-resource'
import type { TableSpec } from '@owlmeans/postgres-resource'

const specOf = (alias: string, schema: string, table: string): TableSpec =>
  pgSchemaHelper.schemaToTableSpec(alias, {
    type: 'object',
    properties: {
      id: { type: 'string', format: 'uuid' },
      email: { type: 'string', pg: { column: 'email_address' } }
    },
    required: ['id']
  } as never, schema, table, true)

/**
 * The placeholder resolver only ever reads `context.resource(alias).table`, so a literal
 * stand-in is both sufficient and clearer than booting a context — and it lets the
 * uninitialized-resource case be constructed at all, which a real context would race.
 */
const contextOf = (resources: Record<string, TableSpec | null>): BasicContext<any> => ({
  resource: (alias: string) => {
    if (!(alias in resources)) {
      throw new Error(`unknown:${alias}`)
    }

    return { table: resources[alias] }
  }
} as unknown as BasicContext<any>)

const users = specOf('users', 'app', 'users')
const posts = specOf('posts', 'app', 'posts')
const context = contextOf({ users, posts })

describe('@owlmeans/postgres-resource — placeholder resolution', () => {
  test('resolves the owning resource', () => {
    expect(pgPlaceholdersOf(context).resolvePlaceholders('SELECT * FROM {{}}', posts))
      .toBe('SELECT * FROM "app"."posts"')
    expect(pgPlaceholdersOf(context).resolvePlaceholders('SELECT * FROM {{ self }}', posts))
      .toBe('SELECT * FROM "app"."posts"')
  })

  test('resolves another registered resource, its columns, its bare name and its schema', () => {
    expect(pgPlaceholdersOf(context).resolvePlaceholders('SELECT * FROM {{users}}', posts))
      .toBe('SELECT * FROM "app"."users"')
    /** The physical column, not the property — a `pg: { column }` rename has to survive. */
    expect(pgPlaceholdersOf(context).resolvePlaceholders('SELECT {{users.email}}', posts))
      .toBe('SELECT "app"."users"."email_address"')
    expect(pgPlaceholdersOf(context).resolvePlaceholders('ON CONSTRAINT {{#users}}', posts))
      .toBe('ON CONSTRAINT "users"')
    expect(pgPlaceholdersOf(context).resolvePlaceholders('SET search_path = {{$}}', posts))
      .toBe('SET search_path = "app"')
  })

  test('leaves bound parameters exactly as written', () => {
    const text = `SELECT * FROM {{}} WHERE "id" = $1 AND "email" = $2 AND note = '{{not-a-placeholder'`
    expect(pgPlaceholdersOf(context).resolvePlaceholders(text, posts))
      .toBe(`SELECT * FROM "app"."posts" WHERE "id" = $1 AND "email" = $2 AND note = '{{not-a-placeholder'`)
  })

  test('refuses an alias it cannot resolve rather than substituting blindly', () => {
    expect(() => pgPlaceholdersOf(context).resolvePlaceholders('SELECT * FROM {{nope}}', posts))
      .toThrow(PostgresPlaceholderError)
    expect(() => pgPlaceholdersOf(context).resolvePlaceholders('SELECT {{users.nope}}', posts))
      .toThrow(PostgresPlaceholderError)
    /** Registered but not yet initialized: the table name genuinely isn't known. */
    expect(() => pgPlaceholdersOf(contextOf({ late: null })).resolvePlaceholders('SELECT * FROM {{late}}', posts))
      .toThrow(PostgresPlaceholderError)
  })

  test('refuses a self reference in a query that has no owning resource', () => {
    expect(() => pgPlaceholdersOf(context).resolvePlaceholders('SELECT * FROM {{}}', null))
      .toThrow(PostgresPlaceholderError)
    expect(() => pgPlaceholdersOf(context).resolvePlaceholders('SET search_path = {{$}}', null))
      .toThrow(PostgresPlaceholderError)
    /** Other aliases stay addressable — a service level query is scopeless, not blind. */
    expect(pgPlaceholdersOf(context).resolvePlaceholders('SELECT * FROM {{users}}', null))
      .toBe('SELECT * FROM "app"."users"')
  })

  /**
   * The cache is keyed by context because a context is what owns a set of database handles:
   * a different context resolves the same alias against a different Postgres schema. A
   * service level query has no owning table to key on, so a process wide cache would hand
   * one context the other's table names.
   */
  test('does not leak resolved table names between contexts', () => {
    const tenantA = contextOf({ users: specOf('users', 'tenant_a', 'users') })
    const tenantB = contextOf({ users: specOf('users', 'tenant_b', 'users') })

    expect(pgPlaceholdersOf(tenantA).resolvePlaceholders('SELECT * FROM {{users}}', null))
      .toBe('SELECT * FROM "tenant_a"."users"')
    expect(pgPlaceholdersOf(tenantB).resolvePlaceholders('SELECT * FROM {{users}}', null))
      .toBe('SELECT * FROM "tenant_b"."users"')
  })

  test('refOf answers the same question without any SQL around it', () => {
    expect(pgPlaceholdersOf(context).refOf(posts)).toBe('"app"."posts"')
    expect(pgPlaceholdersOf(context).refOf(posts, 'users')).toBe('"app"."users"')
    expect(() => pgPlaceholdersOf(context).refOf(null)).toThrow(PostgresPlaceholderError)
  })
})
