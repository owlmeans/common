import { sha256 } from '@noble/hashes/sha2'
import { hex } from '@scure/base'
import type { DbConfig, ResourceRecord } from '@owlmeans/resource'

import { PG_MAX_IDENTIFIER } from '../consts.js'
import type { PostgresResource } from '../types.js'

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_$]*$/

/**
 * Coerce an arbitrary name into a legal Postgres identifier of at most 63 bytes.
 *
 * Postgres cuts anything past `NAMEDATALEN - 1` off server side and says nothing about
 * it, so two names that differ only beyond byte 63 would collapse into one identifier.
 * Clamping here instead leaves room for a hash suffix that keeps them apart.
 */
export const pgIdentifier = (name: string): string => {
  const sanitized = name.replace(/[^A-Za-z0-9_$]/g, '_')
  const prefixed = /^[A-Za-z_]/.test(sanitized) ? sanitized : `_${sanitized}`
  if (Buffer.byteLength(prefixed, 'utf8') <= PG_MAX_IDENTIFIER) {
    return prefixed
  }
  const digest = hex.encode(sha256(new TextEncoder().encode(name))).substring(0, 32)

  return `${prefixed.substring(0, 30)}_${digest}`
}

/**
 * Assert a value is safe to interpolate as an identifier. Postgres can't bind identifiers
 * as parameters, so every one of them reaches the server as text — which makes this the
 * only thing standing between a config value and injection.
 *
 * @throws {SyntaxError}
 */
export const assertSqlIdentifier = (value: string, what: string = 'identifier'): string => {
  if (!SAFE_IDENTIFIER.test(value) || Buffer.byteLength(value, 'utf8') > PG_MAX_IDENTIFIER) {
    throw new SyntaxError(`postgres:unsafe-${what}:${value}`)
  }

  return value
}

/** Quote an identifier for emission, doubling any interior quote. */
export const quoteIdent = (value: string): string => `"${value.replace(/"/g, '""')}"`

/**
 * Quote a string literal. Only ever used for values Postgres refuses to bind — notably
 * the password in `CREATE ROLE`.
 *
 * @throws {SyntaxError} on a NUL byte, which no escaping makes safe.
 */
export const quoteLiteral = (value: string): string => {
  if (value.includes('\0')) {
    throw new SyntaxError('postgres:unsafe-literal:nul-byte')
  }

  return `'${value.replace(/'/g, "''")}'`
}

export const qualify = (schema: string, table: string): string =>
  `${quoteIdent(schema)}.${quoteIdent(table)}`

/**
 * Physical table name of a resource: the explicit `name`, else the resource alias,
 * prefixed per `DbConfig.resourcePrefix` and sanitized.
 */
export const pgTableName = (config: DbConfig, resource: PostgresResource<ResourceRecord>): string =>
  pgIdentifier(`${config.resourcePrefix ?? ''}${resource.name ?? resource.alias}`)

/**
 * Derive a pair of int32s for `pg_advisory_lock` from a qualified table name, so every
 * replica booting against the same table serializes on the same key.
 */
export const advisoryKey = (qualified: string): [number, number] => {
  const digest = sha256(new TextEncoder().encode(`owlmeans:${qualified}`))
  const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength)

  return [view.getInt32(0, false), view.getInt32(4, false)]
}
