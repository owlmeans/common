import { describe, expect, test } from 'bun:test'
import type { DbConfig, ResourceRecord } from '@owlmeans/resource'

import {
  advisoryKey, assertSqlIdentifier, pgIdentifier, pgTableName, qualify, quoteIdent, quoteLiteral
} from '@owlmeans/postgres-resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'

const resource = (alias: string, name?: string): PostgresResource<ResourceRecord> =>
  ({ alias, ...(name != null ? { name } : {}) }) as PostgresResource<ResourceRecord>

describe('@owlmeans/postgres-resource — identifiers', () => {
  test('sanitizes an arbitrary name into something Postgres accepts', () => {
    expect(pgIdentifier('users')).toBe('users')
    /** Resource aliases carry `-` and `:`; column and table names cannot. */
    expect(pgIdentifier('wl-profile')).toBe('wl_profile')
    expect(pgIdentifier('auth:token')).toBe('auth_token')
    expect(pgIdentifier('9lives')).toBe('_9lives')
  })

  /**
   * Postgres truncates past `NAMEDATALEN - 1` server side and says nothing, which would let
   * two names differing only beyond byte 63 collapse into one identifier. Clamping here
   * instead keeps the hash suffix that tells them apart inside the limit.
   */
  test('keeps an overlong name unique inside the 63 byte limit', () => {
    const long = 'a'.repeat(200)
    const identifier = pgIdentifier(long)

    expect(identifier.length).toBe(63)
    expect(Buffer.byteLength(identifier, 'utf8')).toBeLessThanOrEqual(63)
    expect(identifier).not.toBe(pgIdentifier(`${long}b`))
    expect(identifier).toBe(pgIdentifier(long))
  })

  test('assertSqlIdentifier is the last thing between a config value and injection', () => {
    expect(assertSqlIdentifier('app_role')).toBe('app_role')
    expect(() => assertSqlIdentifier('app"; DROP DATABASE x; --')).toThrow(SyntaxError)
    expect(() => assertSqlIdentifier('has space')).toThrow(SyntaxError)
    expect(() => assertSqlIdentifier('a'.repeat(64))).toThrow(SyntaxError)
  })

  test('quotes identifiers and literals', () => {
    expect(quoteIdent('users')).toBe('"users"')
    expect(quoteIdent('we"ird')).toBe('"we""ird"')
    expect(qualify('app', 'users')).toBe('"app"."users"')

    expect(quoteLiteral("O'Brien")).toBe("'O''Brien'")
    /** No escaping makes a NUL byte safe, so it is refused instead of encoded. */
    expect(() => quoteLiteral('nul\0byte')).toThrow(SyntaxError)
  })

  test('derives the physical table name from the resource and its prefix', () => {
    const config = { service: 'postgres', host: 'localhost' } as DbConfig

    expect(pgTableName(config, resource('wl-profile'))).toBe('wl_profile')
    /** An explicit `name` wins — the alias may be unusable as an identifier. */
    expect(pgTableName(config, resource('wl-profile', 'profiles'))).toBe('profiles')
    expect(pgTableName({ ...config, resourcePrefix: 'app_' }, resource('users'))).toBe('app_users')
  })

  test('advisory keys are a stable function of the qualified table', () => {
    const key = advisoryKey('"app"."users"')

    expect(key).toHaveLength(2)
    expect(key).toEqual(advisoryKey('"app"."users"'))
    expect(key).not.toEqual(advisoryKey('"app"."posts"'))
    /** `pg_advisory_lock(int, int)` — anything outside int32 would be rejected by the server. */
    for (const half of key) {
      expect(Number.isInteger(half)).toBe(true)
      expect(half).toBeGreaterThanOrEqual(-2147483648)
      expect(half).toBeLessThanOrEqual(2147483647)
    }
  })
})
