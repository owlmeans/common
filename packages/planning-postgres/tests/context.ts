import { postgresGate, randomNamespace } from '@owlmeans/test-integration'
import type { IntegrationGate, PostgresEnv } from '@owlmeans/test-integration'
import { PgAutoSync } from '@owlmeans/postgres-resource'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { PlanningFacade, PlanningPlugin } from '@owlmeans/planning'
import type { PlanningHostService } from '@owlmeans/server-planning'
import { conformanceClock, planningConformancePlugin } from '@owlmeans/server-planning/conformance'
import { Pool } from 'pg'

import { appendPostgres } from '@owlmeans/postgres'
import type { PostgresService } from '@owlmeans/postgres'

import {
  appendPostgresPlanning, makePlanningCardPostgres, makePlanningLinkPostgres, makePlanningSchemaPostgres,
  makePlanningTransitionPostgres, makePostgresPlanningService,
} from '../src/index.js'
import type { PlanningPostgresLimits, PostgresPlanningStore } from '../src/index.js'

/**
 * Env-gated integration harness, the shape `@owlmeans/marketing-consent-postgres` uses: a real
 * `ServerContext` per boot against a throwaway schema, dropped in `teardown()`. Specs skip cleanly
 * when `POSTGRES_URL` is unset or nothing answers at it.
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

export interface BootOptions {
  limits?: Partial<PlanningPostgresLimits>
  bus?: boolean
  plugins?: PlanningPlugin[]
  /** `files` registers each resource the way a target's `resources/planning/*.ts` does; `append` uses `appendPostgresPlanning`. */
  wiring?: 'files' | 'append' | 'none'
}

export interface Booted {
  context: ServerContext<ServerConfig>
  pg: PostgresService
  service: PlanningHostService
  store: PostgresPlanningStore
  facade: (entityId: string) => PlanningFacade
}

export interface Suite {
  schema: string
  boot: (opts?: BootOptions) => Promise<Booted>
  teardown: () => Promise<void>
}

export const makeSuite = (label: string): Suite => {
  const prefix = process.env.POSTGRES_TEST_DB_PREFIX ?? 'omt'
  const schema = randomNamespace(`${prefix}_${label}`)
  const pools: Pool[] = []
  const stores: PostgresPlanningStore[] = []

  const boot = async (opts: BootOptions = {}): Promise<Booted> => {
    const cfg: ServerConfig = config('planning-pg-test', {
      dbs: [{
        service: 'postgres', alias: 'postgres', host: '127.0.0.1', schema,
        meta: { url: url(), max: 4, retries: 3, retryDelayMillis: 200, autoSync: PgAutoSync.Full },
      }],
    } as Partial<ServerConfig>)

    const context = makeServerContext(cfg) as ServerContext<ServerConfig>
    appendPostgres(context)
    const serviceOptions = {
      plugins: opts.plugins ?? [planningConformancePlugin],
      now: conformanceClock(),
      ...(opts.limits != null ? { limits: opts.limits } : {}),
      ...(opts.bus != null ? { bus: opts.bus } : {}),
    }
    if (opts.wiring === 'append') {
      appendPostgresPlanning(context, serviceOptions)
    } else {
      if (opts.wiring !== 'none') {
        for (const make of [makePlanningCardPostgres, makePlanningTransitionPostgres, makePlanningLinkPostgres, makePlanningSchemaPostgres]) {
          context.registerResource(make())
        }
      }
      context.registerService(makePostgresPlanningService(serviceOptions))
    }

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
    const service = context.service<PlanningHostService>('planning')
    const store = service.store() as PostgresPlanningStore
    stores.push(store)

    return {
      context,
      pg,
      service,
      store,
      facade: entityId => service.for({ entityId, profileId: 'librarian', channel: 'test' }),
    }
  }

  const teardown = async (): Promise<void> => {
    if (gate.skip) {
      return
    }
    for (const store of stores.splice(0)) {
      await store.close().catch(() => undefined)
    }
    await raw(async pool => { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`) })
      .catch(error => console.error(`planning-postgres test teardown (${schema}):`, error))
    while (pools.length > 0) {
      await pools.pop()?.end().catch(() => undefined)
    }
  }

  return { schema, boot, teardown }
}

/** Wait until `check` answers true, polling — for what another process's delivery settles. */
export const eventually = async (check: () => boolean | Promise<boolean>, timeout: number = 5_000): Promise<void> => {
  const deadline = Date.now() + timeout
  while (!await check()) {
    if (Date.now() > deadline) {
      throw new Error('eventually: timed out')
    }
    await new Promise(resolve => setTimeout(resolve, 25))
  }
}
