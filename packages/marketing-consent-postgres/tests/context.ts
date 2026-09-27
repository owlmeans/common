import { postgresGate, randomNamespace } from '@owlmeans/test-integration'
import type { IntegrationGate, PostgresEnv } from '@owlmeans/test-integration'
import { PgAutoSync, resetDeclarations } from '@owlmeans/postgres-resource'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { Pool } from 'pg'

import { appendPostgres } from '@owlmeans/postgres'
import type { PostgresService } from '@owlmeans/postgres'
import { RES_MARKETING_CONSENT_LOG, RES_MARKETING_CONSENT_STATE } from '@owlmeans/server-marketing-consent'

import { appendMarketingConsentPostgres } from '../src/index.js'

/**
 * Env-gated integration harness, the same shape `@owlmeans/postgres`'s own tests use: a real
 * `ServerContext` against a throwaway schema, dropped in `teardown()`. Lives here rather than
 * importing the sibling package's own `tests/context.ts`, which is test-only source that no
 * package exports.
 */
export const gate: IntegrationGate<PostgresEnv> = postgresGate()

const url = (): string => gate.env.POSTGRES_URL as string

export const raw = async <R>(fn: (pool: Pool) => Promise<R>): Promise<R> => {
  const pool = new Pool({ connectionString: url(), max: 1 })
  try {
    return await fn(pool)
  } finally {
    await pool.end().catch(() => undefined)
  }
}

export interface Booted {
  context: ServerContext<ServerConfig>
  pg: PostgresService
}

export interface Suite {
  schema: string
  boot: () => Promise<Booted>
  teardown: () => Promise<void>
}

export const makeSuite = (label: string): Suite => {
  const prefix = process.env.POSTGRES_TEST_DB_PREFIX ?? 'omt'
  const schema = randomNamespace(`${prefix}_${label}`)
  const pools: Pool[] = []

  const boot = async (): Promise<Booted> => {
    /** A fresh declaration per suite run — this spec simulates a freshly started process. */
    resetDeclarations(RES_MARKETING_CONSENT_STATE)
    resetDeclarations(RES_MARKETING_CONSENT_LOG)

    const cfg: ServerConfig = config('mc-pg-test', {
      dbs: [{
        service: 'postgres', alias: 'postgres', host: '127.0.0.1', schema,
        meta: { url: url(), max: 2, retries: 3, retryDelayMillis: 200, autoSync: PgAutoSync.Full }
      }]
    } as Partial<ServerConfig>)

    const context = makeServerContext(cfg) as ServerContext<ServerConfig>
    appendPostgres(context)
    appendMarketingConsentPostgres(context)

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
      .catch(error => console.error(`marketing-consent-postgres test teardown (${schema}):`, error))
    while (pools.length > 0) {
      await pools.pop()?.end().catch(() => undefined)
    }
  }

  return { schema, boot, teardown }
}
