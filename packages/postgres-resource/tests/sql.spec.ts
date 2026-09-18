import { describe, expect, test } from 'bun:test'
import type { BasicContext } from '@owlmeans/context'

import {
  PostgresPlaceholderError, refOf, resolvePlaceholders, schemaToTableSpec
} from '@owlmeans/postgres-resource'
import type { TableSpec } from '@owlmeans/postgres-resource'

const specOf = (alias: string, schema: string, table: string): TableSpec =>
  schemaToTableSpec(alias, {
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
    expect(resolvePlaceholders('SELECT * FROM {{}}', context, posts))
      .toBe('SELECT * FROM "app"."posts"')
    expect(resolvePlaceholders('SELECT * FROM {{ self }}', context, posts))
      .toBe('SELECT * FROM "app"."posts"')
  })

  test('resolves another registered resource, its columns, its bare name and its schema', () => {
    expect(resolvePlaceholders('SELECT * FROM {{users}}', context, posts))
      .toBe('SELECT * FROM "app"."users"')
    /** The physical column, not the property — a `pg: { column }` rename has to survive. */
    expect(resolvePlaceholders('SELECT {{users.email}}', context, posts))
      .toBe('SELECT "app"."users"."email_address"')
    expect(resolvePlaceholders('ON CONSTRAINT {{#users}}', context, posts))
      .toBe('ON CONSTRAINT "users"')
    expect(resolvePlaceholders('SET search_path = {{$}}', context, posts))
      .toBe('SET search_path = "app"')
  })

  test('leaves bound parameters exactly as written', () => {
    const text = `SELECT * FROM {{}} WHERE "id" = $1 AND "email" = $2 AND note = '{{not-a-placeholder'`
    expect(resolvePlaceholders(text, context, posts))
      .toBe(`SELECT * FROM "app"."posts" WHERE "id" = $1 AND "email" = $2 AND note = '{{not-a-placeholder'`)
  })

  test('refuses an alias it cannot resolve rather than substituting blindly', () => {
    expect(() => resolvePlaceholders('SELECT * FROM {{nope}}', context, posts))
      .toThrow(PostgresPlaceholderError)
    expect(() => resolvePlaceholders('SELECT {{users.nope}}', context, posts))
      .toThrow(PostgresPlaceholderError)
    /** Registered but not yet initialized: the table name genuinely isn't known. */
    expect(() => resolvePlaceholders('SELECT * FROM {{late}}', contextOf({ late: null }), posts))
      .toThrow(PostgresPlaceholderError)
  })

  test('refuses a self reference in a query that has no owning resource', () => {
    expect(() => resolvePlaceholders('SELECT * FROM {{}}', context, null))
      .toThrow(PostgresPlaceholderError)
    expect(() => resolvePlaceholders('SET search_path = {{$}}', context, null))
      .toThrow(PostgresPlaceholderError)
    /** Other aliases stay addressable — a service level query is scopeless, not blind. */
    expect(resolvePlaceholders('SELECT * FROM {{users}}', context, null))
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

    expect(resolvePlaceholders('SELECT * FROM {{users}}', tenantA, null))
      .toBe('SELECT * FROM "tenant_a"."users"')
    expect(resolvePlaceholders('SELECT * FROM {{users}}', tenantB, null))
      .toBe('SELECT * FROM "tenant_b"."users"')
  })

  test('refOf answers the same question without any SQL around it', () => {
    expect(refOf(context, posts)).toBe('"app"."posts"')
    expect(refOf(context, posts, 'users')).toBe('"app"."users"')
    expect(() => refOf(context, null)).toThrow(PostgresPlaceholderError)
  })
})
