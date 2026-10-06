import { sha256 } from '@noble/hashes/sha2.js'
import { hex } from '@scure/base'
import type { DbConfig, ResourceRecord } from '@owlmeans/resource'

import { PG_MAX_IDENTIFIER } from '../consts.js'
import type { PostgresResource } from '../types.js'
import { SAFE_IDENTIFIER } from './consts.local.js'
import type { PgNameHelper } from './name/types.js'

export const createPgNameHelper = (): PgNameHelper => {
  const pgIdentifier = (name: string): string => {
    const sanitized = name.replace(/[^A-Za-z0-9_$]/g, '_')
    const prefixed = /^[A-Za-z_]/.test(sanitized) ? sanitized : `_${sanitized}`
    if (Buffer.byteLength(prefixed, 'utf8') <= PG_MAX_IDENTIFIER) {
      return prefixed
    }
    const digest = hex.encode(sha256(new TextEncoder().encode(name))).substring(0, 32)

    return `${prefixed.substring(0, 30)}_${digest}`
  }

  const assertSqlIdentifier = (value: string, what: string = 'identifier'): string => {
    if (!SAFE_IDENTIFIER.test(value) || Buffer.byteLength(value, 'utf8') > PG_MAX_IDENTIFIER) {
      throw new SyntaxError(`postgres:unsafe-${what}:${value}`)
    }

    return value
  }

  const quoteIdent = (value: string): string => `"${value.replace(/"/g, '""')}"`

  const quoteLiteral = (value: string): string => {
    if (value.includes('\0')) {
      throw new SyntaxError('postgres:unsafe-literal:nul-byte')
    }

    return `'${value.replace(/'/g, "''")}'`
  }

  const qualify = (schema: string, table: string): string =>
    `${quoteIdent(schema)}.${quoteIdent(table)}`

  const pgTableName = (config: DbConfig, resource: PostgresResource<ResourceRecord>): string =>
    pgIdentifier(`${config.resourcePrefix ?? ''}${resource.name ?? resource.alias}`)

  const advisoryKey = (qualified: string): [number, number] => {
    const digest = sha256(new TextEncoder().encode(`owlmeans:${qualified}`))
    const view = new DataView(digest.buffer, digest.byteOffset, digest.byteLength)

    return [view.getInt32(0, false), view.getInt32(4, false)]
  }

  return { pgIdentifier, assertSqlIdentifier, quoteIdent, quoteLiteral, qualify, pgTableName, advisoryKey }
}

export const pgNameHelper = createPgNameHelper()

/** @deprecated compat:factory-refactor — use `pgNameHelper.pgIdentifier(…)` */
export const pgIdentifier = (name: string): string => pgNameHelper.pgIdentifier(name)

/** @deprecated compat:factory-refactor — use `pgNameHelper.quoteIdent(…)` */
export const quoteIdent = (value: string): string => pgNameHelper.quoteIdent(value)

/** @deprecated compat:factory-refactor — use `pgNameHelper.advisoryKey(…)` */
export const advisoryKey = (qualified: string): [number, number] => pgNameHelper.advisoryKey(qualified)
