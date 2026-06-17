import { mongoGate, randomNamespace, registerCleanup } from '@owlmeans/test-integration'
import type { IntegrationGate, MongoEnv } from '@owlmeans/test-integration'

export interface MongoTestEnv {
  gate: IntegrationGate<MongoEnv>
  dbName: string
}

let cached: MongoTestEnv | null = null

/**
 * Per-package test env for mongo-resource. Reads `mongoGate()` once;
 * if the gate is open, derives a randomly-namespaced database name and
 * registers a cleanup to drop that database after the suite. If the
 * gate is closed, returns the same shape so specs can `gate.skip`-self
 * without branching on truthiness.
 *
 * NOTE: this pilot intentionally does NOT instantiate the real
 * @owlmeans/mongo service yet — that wiring belongs to the full
 * integration test pass and depends on the consuming app's config
 * shape. The pilot proves the gate + namespacing + cleanup pattern.
 */
export const getTestEnv = (): MongoTestEnv => {
  if (cached != null) return cached
  const gate = mongoGate()
  const prefix = process.env.MONGO_TEST_DB_PREFIX ?? 'omt'
  const dbName = randomNamespace(prefix)
  cached = { gate, dbName }
  if (!gate.skip) {
    registerCleanup(async () => {
      const { MongoClient } = await import('mongodb')
      const client = new MongoClient(gate.env.MONGO_URL as string)
      try {
        await client.connect()
        await client.db(dbName).dropDatabase()
      } finally {
        await client.close()
      }
    })
  }
  return cached
}
