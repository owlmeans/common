import { postgresGate, randomNamespace } from '@owlmeans/test-integration'
import type { IntegrationGate, PostgresEnv } from '@owlmeans/test-integration'
import { PgAutoSync, resetPlaceholderCache } from '@owlmeans/postgres-resource'
import type { PostgresResource } from '@owlmeans/postgres-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { Pool } from 'pg'

import { appendPostgres, DEF_ADMIN_ALIAS } from '@owlmeans/postgres'
import type { PostgresService } from '@owlmeans/postgres'

/**
 * Integration harness for the Postgres pair.
 *
 * Unlike the `mongo-resource` pilot, which only proves the gate/namespace/cleanup pattern
 * against the raw driver, these suites build a real `ServerContext` and drive
 * `makePostgresResource` end to end — a resource is meaningless without the db service
 * that backs it, which is why the specs live in this package rather than the resource one
 * (the reverse would make `@owlmeans/postgres-resource` dev-depend on its own dependent).
 */
export const gate: IntegrationGate<PostgresEnv> = postgresGate()

const url = (): string => gate.env.POSTGRES_URL as string

/** Short lived, single connection pool for setup and assertions outside any context. */
export const raw = async <R>(fn: (pool: Pool) => Promise<R>): Promise<R> => {
  const pool = new Pool({ connectionString: url(), max: 1 })
  try {
    return await fn(pool)
  } finally {
    await pool.end().catch(() => undefined)
  }
}

export interface PgCapabilities {
  /** The connection role can CREATE ROLE and CREATE DATABASE — what the admin path needs. */
  bootstrap: boolean
}

/**
 * Probed once, at module load, because Bun decides `test` vs `test.skip` synchronously and
 * a suite cannot await its own gate. A role without `CREATEROLE`/`CREATEDB` still runs
 * everything else — only the bootstrap suite self-skips.
 */
export const capabilities: PgCapabilities = gate.skip
  ? { bootstrap: false }
  : await raw(async pool => {
    const { rows } = await pool.query<{ super: boolean, role: boolean, db: boolean }>(
      `SELECT rolsuper AS "super", rolcreaterole AS role, rolcreatedb AS db
         FROM pg_roles WHERE rolname = current_user`
    )
    const row = rows[0]

    return { bootstrap: row != null && (row.super || (row.role && row.db)) }
  }).catch(() => ({ bootstrap: false }))

export interface BootOptions {
  /** Registered in the order given — which is *not* dependency order, deliberately. */
  resources?: Array<PostgresResource<any>>
  autoSync?: PgAutoSync
  /** Also configure a second alias pointing at the same server, for the admin path. */
  admin?: boolean
}

export type { PostgresResource, PostgresService }

export interface Booted {
  context: ServerContext<ServerConfig>
  pg: PostgresService
}

export interface PgSuite {
  /** Postgres SCHEMA this suite owns end to end. Dropped by {@link teardown}. */
  schema: string
  boot: (opts?: BootOptions) => Promise<Booted>
  /**
   * Track pools a service opened *after* `boot()` returned. Config aliases connect lazily,
   * so an alias only reached later — the admin one — has no pool at init time.
   */
  collect: (pg: PostgresService) => void
  teardown: () => Promise<void>
}

/**
 * One namespace per suite, torn down by that suite's own `afterAll`.
 *
 * The shared `registerCleanup`/`runCleanups` queue is process global, and Bun runs every
 * spec file of a package in one process — so the first file to finish would drop the
 * namespaces of the files still to come.
 */
export const makeSuite = (label: string): PgSuite => {
  const prefix = process.env.POSTGRES_TEST_DB_PREFIX ?? 'omt'
  const schema = randomNamespace(`${prefix}_${label}`)
  const pools: Pool[] = []

  const boot = async (opts: BootOptions = {}): Promise<Booted> => {
    /**
     * The cache is keyed by context and a context is never rebooted, so entries from a
     * previous `boot()` are dead weight rather than a hazard — but a suite that runs ten
     * boots would otherwise carry all ten.
     *
     * Declarations are deliberately *not* reset here. They survive a context switch on
     * purpose (that is the whole point of keying them by alias), and a `.migration()`
     * registered before `boot()` would be silently dropped. A spec that wants a clean
     * slate calls `resetDeclarations(alias)` itself, which is exactly what a spec
     * simulating a restarted process should have to say out loud.
     */
    resetPlaceholderCache()

    const meta = { url: url(), max: 2, retries: 3, retryDelayMillis: 200 }
    const cfg: ServerConfig = config('pg-test', {
      dbs: [
        {
          service: 'postgres',
          alias: 'postgres',
          host: '127.0.0.1',
          schema,
          meta: { ...meta, autoSync: opts.autoSync ?? PgAutoSync.Full }
        },
        ...(opts.admin === true
          ? [{ service: 'postgres', alias: DEF_ADMIN_ALIAS, host: '127.0.0.1', meta }]
          : [])
      ]
    } as Partial<ServerConfig>)

    const context = makeServerContext(cfg) as ServerContext<ServerConfig>
    appendPostgres(context)

    for (const resource of opts.resources ?? []) {
      context.registerResource(resource as never)
    }

    context.configure()
    const pg = context.service<PostgresService>('postgres')
    try {
      await context.init()
    } finally {
      /**
       * Captured in `finally` because the suites that assert a *failed* boot — a refused
       * cast, a throwing migration — open a pool before the failure and would otherwise
       * leak it for the rest of the run.
       */
      collect(pg)
    }

    return { context, pg }
  }

  const collect = (pg: PostgresService): void => {
    for (const pool of Object.values(pg.clients ?? {})) {
      if (!pools.includes(pool)) {
        pools.push(pool)
      }
    }
  }

  const teardown = async (): Promise<void> => {
    if (gate.skip) {
      return
    }
    await raw(async pool => { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`) })
      .catch(error => console.error(`postgres test teardown (${schema}):`, error))
    /** After the drop — a pool still holding the schema open makes CASCADE wait. */
    while (pools.length > 0) {
      await pools.pop()?.end().catch(() => undefined)
    }
  }

  return { schema, boot, collect, teardown }
}

/** Columns of a table as Postgres currently reports them, `name → "type[ NOT NULL]"`. */
export const shapeOf = async (
  pg: PostgresService, schema: string, table: string
): Promise<Record<string, string>> => {
  const rows = await pg.query<{ name: string, type: string, not_null: boolean }>(
    `SELECT a.attname AS name, format_type(a.atttypid, a.atttypmod) AS type, a.attnotnull AS not_null
       FROM pg_attribute a
      WHERE a.attrelid = to_regclass($1) AND a.attnum > 0 AND NOT a.attisdropped
      ORDER BY a.attnum`,
    [`"${schema}"."${table}"`]
  )

  return Object.fromEntries(rows.map(row => [row.name, `${row.type}${row.not_null ? ' NOT NULL' : ''}`]))
}

export interface LedgerRow {
  alias: string
  name: string
  stage: string
  baseline: boolean
}

export const ledgerOf = async (pg: PostgresService, schema: string): Promise<LedgerRow[]> =>
  await pg.query<LedgerRow & Record<string, unknown>>(
    `SELECT alias, name, stage, baseline FROM "${schema}"."_owlmeans_migrations" ORDER BY name`
  )

export interface Note extends ResourceRecord {
  id?: string
  title: string
  slug?: string
}
