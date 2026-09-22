import { mongoGate, randomNamespace } from '@owlmeans/test-integration'
import type { IntegrationGate, MongoEnv } from '@owlmeans/test-integration'
import { appendMongo } from '@owlmeans/mongo'
import type { MongoDbService } from '@owlmeans/mongo-resource'
import { config, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { MongoClient } from 'mongodb'
import { appendMarketingConsentMongo } from '../src/helper.js'

/**
 * Category-C harness: a real `ServerContext` over a real Mongo database, with the two resources
 * registered through `appendMarketingConsentMongo` exactly as a consuming app would — mirrors
 * `@owlmeans/mongo`'s and `@owlmeans/server-payment`'s own `tests/context.ts`. One database per
 * suite, dropped by that suite's own teardown.
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

export interface Booted {
  context: ServerContext<ServerConfig>
  mongo: MongoDbService
}

export interface MongoSuite {
  database: string
  boot: () => Promise<Booted>
  teardown: () => Promise<void>
}

export const makeSuite = (label: string): MongoSuite => {
  const prefix = process.env.MONGO_TEST_DB_PREFIX ?? 'omt'
  const database = randomNamespace(`${prefix}_${label}`)
  const clients: MongoClient[] = []

  const boot = async (): Promise<Booted> => {
    const parsed = new URL(url())
    const cfg: ServerConfig = config('mc-mongo-test', {
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
    appendMarketingConsentMongo(context)

    context.configure()
    const mongo = context.service<MongoDbService>('mongo')
    try {
      await context.init()
    } finally {
      for (const client of Object.values(mongo.clients ?? {}) as MongoClient[]) {
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
      .catch(error => console.error(`marketing-consent-mongo test teardown (${database}):`, error))
    while (clients.length > 0) {
      await clients.pop()?.close().catch(() => undefined)
    }
  }

  return { database, boot, teardown }
}
