import { afterAll, describe, expect, test } from 'bun:test'
import { runCleanups } from '@owlmeans/test-integration'
import { getTestEnv } from './context.js'

const env = getTestEnv()
const it = env.gate.skip ? test.skip : test

afterAll(async () => {
  await runCleanups()
})

describe('@owlmeans/mongo-resource — connection round-trip', () => {
  if (env.gate.skip) {
    test.skip(env.gate.reason ?? 'mongo gate closed', () => {})
    return
  }

  it('inserts and reads a document via the namespaced test database', async () => {
    const { MongoClient } = await import('mongodb')
    const client = new MongoClient(env.gate.env.MONGO_URL as string)
    await client.connect()
    try {
      const col = client.db(env.dbName).collection<{ id: string, value: number }>('pilot')
      await col.insertOne({ id: 'a', value: 42 })
      const doc = await col.findOne({ id: 'a' })
      expect(doc?.value).toBe(42)
    } finally {
      await client.close()
    }
  })
})
