import { afterAll, afterEach, describe, expect, test } from 'bun:test'
import { addLogPlugin, memoryPlugin } from '@owlmeans/log'
import { StorageApiError } from '@owlmeans/storage-common'
import { makeStorageBucketModel } from '../src/index.js'
import { PNG, boot, bucketConfig, randomBucketName, removeBuckets, s3, streamOf, unreachableConfig } from './context.js'

const ENSURE_FAILED = 'storage-resource.ensure-failed'

describe('@owlmeans/storage-resource — ensure at start-up (offline)', () => {
  const memory = memoryPlugin('storage-ensure')
  const remove = addLogPlugin(memory)

  afterEach(() => { memory.clear() })
  afterAll(() => { remove() })

  const ensureFailures = (): number => memory.records.filter(record => record.event === ENSURE_FAILED).length

  test('an unreachable store never fails start-up, and the next upload retries the ensure', async () => {
    const { storage } = await boot(await unreachableConfig({ ensure: true }))

    expect(ensureFailures()).toBe(1)
    expect(memory.records.find(record => record.event === ENSURE_FAILED)).toMatchObject({ level: 'warn', scope: 'storage-resource' })

    await expect(storage.create({ prefix: 'dot.png', stream: streamOf(PNG), size: PNG.length, type: 'image/png' }))
      .rejects.toBeInstanceOf(StorageApiError)
    expect(ensureFailures()).toBe(2)
  }, 30_000)

  test('an entry without ensure is never contacted at start-up', async () => {
    await boot(await unreachableConfig())

    expect(ensureFailures()).toBe(0)
  }, 30_000)

  test('a malformed ensure entry is logged, never thrown', async () => {
    await boot({ ...(await unreachableConfig({ ensure: true })), apiKey: 'no-colon' })

    expect(ensureFailures()).toBe(1)
  }, 30_000)
})

describe('@owlmeans/storage-resource — bucket ensure', () => {
  if (s3.skip) {
    test.skip(s3.reason ?? 's3 gate closed', () => { })
    return
  }

  const created: string[] = []

  afterAll(async () => { await removeBuckets(created) })

  test('ensure creates a missing bucket, then finds it', async () => {
    const name = randomBucketName()
    const bucket = makeStorageBucketModel(bucketConfig(undefined, { bucket: name }))

    expect(await bucket.exists()).toBe(false)
    created.push(name)
    expect(await bucket.ensure()).toBe('created')
    expect(await bucket.exists()).toBe(true)
    expect(await bucket.ensure()).toBe('exists')
  }, 60_000)

  test('concurrent ensures of one missing bucket both succeed', async () => {
    const name = randomBucketName()
    const bucket = makeStorageBucketModel(bucketConfig(undefined, { bucket: name }))
    created.push(name)

    const outcomes = await Promise.all([bucket.ensure(), bucket.ensure()])

    expect(outcomes).toContain('created')
    expect(await bucket.exists()).toBe(true)
  }, 60_000)

  test('the resource ensures an ensure: true bucket while the context initializes', async () => {
    const name = randomBucketName()
    const entry = bucketConfig(undefined, { bucket: name, ensure: true })
    created.push(name)

    await boot(entry)

    expect(await makeStorageBucketModel(entry).exists()).toBe(true)
  }, 60_000)
})
