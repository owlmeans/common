import { randomNamespace, gateHelper } from '@owlmeans/test-integration'
import type { IntegrationGate, PostgresEnv } from '@owlmeans/test-integration'
import { configureLog, logger } from '@owlmeans/log'
import { PgAutoSync } from '@owlmeans/postgres-resource'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { Pool } from 'pg'

import { appendPostgres } from '@owlmeans/postgres'
import type { PostgresService } from '@owlmeans/postgres'

import { appendPostgresBot } from '../src/index.js'
import type { BotPostgresOptions } from '../src/index.js'

// Handler failures and refused actions are expected in the conformance cases; `LOG_LEVEL=debug` shows them.
configureLog({ level: process.env.LOG_LEVEL ?? 'error' })

const log = logger('bot-postgres:tests')

/**
 * Env-gated integration harness, the shape `@owlmeans/marketing-consent-postgres` and
 * `@owlmeans/planning-postgres` use: a real `ServerContext` per boot against a throwaway schema of
 * this suite's own, dropped in `teardown()`. Specs skip cleanly when `POSTGRES_URL` is unset or
 * nothing answers at it.
 */
export const gate: IntegrationGate<PostgresEnv> = gateHelper.postgresGate()

const url = (): string => gate.env.POSTGRES_URL as string

export const raw = async <R>(fn: (pool: Pool) => Promise<R>): Promise<R> => {
  const pool = new Pool({ connectionString: url(), max: 1 })
  try {
    return await fn(pool)
  } finally {
    await pool.end().catch(() => undefined)
  }
}

export interface BootOptions {
  /** Passed to `appendPostgresBot`. */
  bot?: BotPostgresOptions
  /** Runs after the resources are registered and before `init()` — where a service is appended. */
  prepare?: (context: ServerContext<ServerConfig>) => void
}

export interface Booted {
  context: ServerContext<ServerConfig>
  pg: PostgresService
}

export interface Suite {
  schema: string
  boot: (opts?: BootOptions) => Promise<Booted>
  teardown: () => Promise<void>
}

export const makeSuite = (label: string): Suite => {
  const prefix = process.env.POSTGRES_TEST_DB_PREFIX ?? 'omt'
  const schema = randomNamespace(`${prefix}_bot_${label}`)
  const pools: Pool[] = []

  const boot = async (opts: BootOptions = {}): Promise<Booted> => {
    const cfg: ServerConfig = config('bot-pg-test', {
      dbs: [{
        service: 'postgres', alias: 'postgres', host: '127.0.0.1', schema,
        meta: { url: url(), max: 4, retries: 3, retryDelayMillis: 200, autoSync: PgAutoSync.Full },
      }],
    } as Partial<ServerConfig>)

    const context = makeServerContext(cfg) as ServerContext<ServerConfig>
    appendPostgres(context)
    appendPostgresBot(context, opts.bot)
    opts.prepare?.(context)

    context.configure()
    const pg = context.service<PostgresService>('postgres')
    try {
      await context.init()
    } finally {
      for (const pool of Object.values(pg.clients ?? {})) {
        if (!pools.includes(pool)) {
          pools.push(pool)
        }
      }
    }

    return { context, pg }
  }

  const teardown = async (): Promise<void> => {
    if (gate.skip) {
      return
    }
    await raw(async pool => { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`) })
      .catch(error => log.error('Test schema not dropped', { schema, error }))
    /** After the drop — a pool still holding the schema open makes CASCADE wait. */
    while (pools.length > 0) {
      await pools.pop()?.end().catch(() => undefined)
    }
  }

  return { schema, boot, teardown }
}
