import type { DbConfig, ResourceRecord } from '@owlmeans/resource'

import type { PostgresResource } from '../../types.js'

/** Postgres identifiers and literals: sanitizing, asserting, quoting and naming. */
export interface PgNameHelper {
  /**
   * Coerce an arbitrary name into a legal Postgres identifier of at most 63 bytes.
   *
   * Postgres cuts anything past `NAMEDATALEN - 1` off server side and says nothing about
   * it, so two names that differ only beyond byte 63 would collapse into one identifier.
   * Clamping here instead leaves room for a hash suffix that keeps them apart.
   */
  pgIdentifier: (name: string) => string
  /**
   * Assert a value is safe to interpolate as an identifier. Postgres can't bind identifiers
   * as parameters, so every one of them reaches the server as text — which makes this the
   * only thing standing between a config value and injection.
   *
   * @throws {SyntaxError}
   */
  assertSqlIdentifier: (value: string, what?: string) => string
  /** Quote an identifier for emission, doubling any interior quote. */
  quoteIdent: (value: string) => string
  /**
   * Quote a string literal. Only ever used for values Postgres refuses to bind — notably
   * the password in `CREATE ROLE`.
   *
   * @throws {SyntaxError} on a NUL byte, which no escaping makes safe.
   */
  quoteLiteral: (value: string) => string
  /** `"schema"."table"`, each part quoted. */
  qualify: (schema: string, table: string) => string
  /**
   * Physical table name of a resource: the explicit `name`, else the resource alias,
   * prefixed per `DbConfig.resourcePrefix` and sanitized.
   */
  pgTableName: (config: DbConfig, resource: PostgresResource<ResourceRecord>) => string
  /**
   * Derive a pair of int32s for `pg_advisory_lock` from a qualified table name, so every
   * replica booting against the same table serializes on the same key.
   */
  advisoryKey: (qualified: string) => [number, number]
}
