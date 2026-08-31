import { mongoGate, randomNamespace } from '@owlmeans/test-integration'
import type { IntegrationGate, MongoEnv } from '@owlmeans/test-integration'
import type { MongoResource } from '@owlmeans/mongo-resource'
import type { ResourceRecord } from '@owlmeans/resource'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { MongoClient } from 'mongodb'
import type { Db } from 'mongodb'

import { appendMongo } from '@owlmeans/mongo'
import type { MongoDbService } from '@owlmeans/mongo-resource'

/**
 * Integration harness for the Mongo pair.
 *
 * The `mongo-resource` suite is a pilot that drives the raw driver and proves only the
 * gate/namespace/cleanup pattern. This one builds a real `ServerContext`, registers
 * resources through `makeMongoResource` and exercises the migration ledger end to end —
 * which is why it lives here rather than there (the reverse would make
 * `@owlmeans/mongo-resource` dev-depend on its own dependent).
 */
export const gate: IntegrationGate<MongoEnv> = mongoGate()

const url = (): string => gate.env.MONGO_URL as string

/** Short lived client for setup and assertions outside any context. */
export const raw = async <R>(fn: (client: MongoClient) => Promise<R>): Promise<R> => {
  const client = new MongoClient(url())
  try {
    await client.connect()

    return await fn(client)
  } finally {
    await client.close().catch(() => undefined)
  }
}

export interface BootOptions {
  /** Registered in the order given — which is *not* dependency order, deliberately. */
  resources?: Array<MongoResource<any>>
}

export type { MongoDbService, MongoResource }

export interface Booted {
  context: ServerContext<ServerConfig>
  mongo: MongoDbService
}

export interface MongoSuite {
  /** Mongo DATABASE this suite owns end to end. Dropped by {@link teardown}. */
  database: string
  boot: (opts?: BootOptions) => Promise<Booted>
  teardown: () => Promise<void>
}

/**
 * One database per suite, torn down by that suite's own `afterAll`.
 *
 * The shared `registerCleanup`/`runCleanups` queue is process global and Bun runs every
 * spec file of a package in one process, so the first file to finish would drop the
 * databases of the files still to come.
 */
export const makeSuite = (label: string): MongoSuite => {
  const prefix = process.env.MONGO_TEST_DB_PREFIX ?? 'omt'
  const database = randomNamespace(`${prefix}_${label}`)
  const clients: MongoClient[] = []

  const boot = async (opts: BootOptions = {}): Promise<Booted> => {
    /**
     * `prepareConfig` builds the connection string from `host`/`port`/`user`/`secret` rather
     * than taking a URL, so the gate's URL is decomposed here. `schema` is the database name —
     * that is what `dbName()` reads.
     */
    const parsed = new URL(url())
    const cfg: ServerConfig = config('mongo-test', {
      dbs: [{
        service: 'mongo',
        alias: 'mongo',
        host: decodeURIComponent(parsed.hostname).replace(/^\[|\]$/g, ''),
        port: parsed.port !== '' ? parseInt(parsed.port, 10) : 27017,
        schema: database,
        ...(parsed.username !== ''
          ? { user: decodeURIComponent(parsed.username), secret: decodeURIComponent(parsed.password) }
          : {})
      }]
    } as Partial<ServerConfig>)

    const context = makeServerContext(cfg) as ServerContext<ServerConfig>
    appendMongo(context)

    for (const resource of opts.resources ?? []) {
      context.registerResource(resource as never)
    }

    context.configure()
    const mongo = context.service<MongoDbService>('mongo')
    try {
      await context.init()
    } finally {
      /**
       * Captured in `finally` because the suites that assert a *failed* boot — a throwing
       * migration — open a client before the failure and would otherwise leak it.
       */
      for (const client of Object.values(mongo.clients ?? {})) {
        if (!clients.includes(client)) {
          clients.push(client)
        }
      }
    }

    return { context, mongo }
  }

  const teardown = async (): Promise<void> => {
    if (gate.skip) {
      return
    }
    await raw(async client => { await client.db(database).dropDatabase() })
      .catch(error => console.error(`mongo test teardown (${database}):`, error))
    while (clients.length > 0) {
      await clients.pop()?.close().catch(() => undefined)
    }
  }

  return { database, boot, teardown }
}

export interface LedgerRow {
  alias: string
  name: string
  stage: string
  baseline: boolean
  checksum: string | null
  completedAt: Date | null
}

export const ledgerOf = async (mongo: MongoDbService, alias: string): Promise<LedgerRow[]> => {
  const db: Db = await mongo.db()

  return await db.collection<LedgerRow>('_owlmeans_migrations')
    .find({ alias }).sort({ name: 1 }).toArray() as LedgerRow[]
}

export interface Note extends ResourceRecord {
  id?: string
  title: string
  slug?: string
}
