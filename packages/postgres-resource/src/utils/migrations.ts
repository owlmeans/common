import type { Migration, MigrationStore } from '@owlmeans/resource'
import type { PoolClient, QueryResultRow } from 'pg'

import { pgErrorToResourceError } from '../errors.js'
import type { PostgresTx, TableSpec } from '../types.js'
import { qualify, quoteIdent } from './name.js'

/**
 * A transaction façade over a checked out client. `{{alias}}` resolution is injected so
 * migrations can address other resources by alias without importing the context.
 */
export const makeTx = (
  client: PoolClient, resolve: (text: string) => string, ref: (alias?: string) => string
): PostgresTx => ({
  client,

  query: async <Row extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => {
    try {
      const result = await client.query<Row>(resolve(text), params as never[])
      return result.rows
    } catch (error) {
      throw pgErrorToResourceError(error)
    }
  },

  queryOne: async <Row extends QueryResultRow = QueryResultRow>(text: string, params?: unknown[]) => {
    try {
      const result = await client.query<Row>(resolve(text), params as never[])
      return result.rows[0] ?? null
    } catch (error) {
      throw pgErrorToResourceError(error)
    }
  },

  execute: async (text: string, params?: unknown[]) => {
    try {
      const result = await client.query(resolve(text), params as never[])
      return result.rowCount ?? 0
    } catch (error) {
      throw pgErrorToResourceError(error)
    }
  },

  ref
})

/**
 * Migration ledger, one table per Postgres schema.
 *
 * It lives inside the resource's own schema, so an Entity layer schema carries its own
 * ledger — correct, because it also carries its own tables.
 */
export const makeMigrationStore = (
  client: PoolClient,
  spec: TableSpec,
  table: string,
  resolve: (text: string) => string,
  ref: (alias?: string) => string
): MigrationStore<PostgresTx> => {
  const ledger = qualify(spec.schema, table)

  return {
    ensure: async () => {
      try {
        await client.query(
          `CREATE TABLE IF NOT EXISTS ${ledger} (`
          + `  ${quoteIdent('alias')} text NOT NULL,`
          + `  ${quoteIdent('name')} text NOT NULL,`
          + `  ${quoteIdent('stage')} text NOT NULL DEFAULT 'pre',`
          + `  ${quoteIdent('checksum')} text,`
          + `  ${quoteIdent('baseline')} boolean NOT NULL DEFAULT false,`
          + `  ${quoteIdent('applied_at')} timestamptz NOT NULL DEFAULT now(),`
          + `  ${quoteIdent('duration_ms')} integer,`
          + `  CONSTRAINT ${quoteIdent(`${table}_pkey`)} PRIMARY KEY (${quoteIdent('alias')}, ${quoteIdent('name')})`
          + ')'
        )
      } catch (error) {
        throw pgErrorToResourceError(error)
      }
    },

    applied: async alias => {
      const result = await client.query<{ name: string, checksum: string | null }>(
        `SELECT ${quoteIdent('name')}, ${quoteIdent('checksum')} FROM ${ledger} WHERE ${quoteIdent('alias')} = $1`,
        [alias]
      )

      return result.rows.reduce<Record<string, string | null>>((applied, row) => {
        applied[row.name] = row.checksum
        return applied
      }, {})
    },

    baseline: async (alias, migrations) => {
      const values = migrations
        .map((_, position) => `($1, $${position * 3 + 2}, $${position * 3 + 3}, $${position * 3 + 4}, true)`)
        .join(', ')
      const params: unknown[] = [alias]
      for (const migration of migrations) {
        params.push(migration.name, migration.stage, migration.checksum)
      }
      try {
        await client.query(
          `INSERT INTO ${ledger} (${quoteIdent('alias')}, ${quoteIdent('name')}, ${quoteIdent('stage')},`
          + ` ${quoteIdent('checksum')}, ${quoteIdent('baseline')}) VALUES ${values}`
          + ` ON CONFLICT (${quoteIdent('alias')}, ${quoteIdent('name')}) DO NOTHING`,
          params as never[]
        )
      } catch (error) {
        throw pgErrorToResourceError(error)
      }
    },

    run: async (alias: string, migration: Migration<PostgresTx>) => {
      const started = Date.now()
      await client.query('BEGIN')
      try {
        await migration.apply(makeTx(client, resolve, ref))
        /**
         * The ledger row commits with the migration itself, so a migration is never left
         * half applied and recorded — the pair is atomic or neither happened.
         */
        await client.query(
          `INSERT INTO ${ledger} (${quoteIdent('alias')}, ${quoteIdent('name')}, ${quoteIdent('stage')},`
          + ` ${quoteIdent('checksum')}, ${quoteIdent('duration_ms')}) VALUES ($1, $2, $3, $4, $5)`,
          [alias, migration.name, migration.stage, migration.checksum, Date.now() - started] as never[]
        )
        await client.query('COMMIT')
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined)
        throw pgErrorToResourceError(error)
      }
    }
  }
}
