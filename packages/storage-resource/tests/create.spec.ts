import { afterAll, describe, expect, test } from 'bun:test'
import { Readable } from 'node:stream'
import { HeadObjectCommand } from '@aws-sdk/client-s3'
import { FileTypeError } from '@owlmeans/storage-common'
import { randomNamespace } from '@owlmeans/test-integration'
import { makeStorageBucketModel } from '../src/index.js'
import { boot, bucketConfig, removeObjects, s3 } from './context.js'

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

describe('@owlmeans/storage-resource — upload', () => {
  if (s3.skip) {
    test.skip(s3.reason ?? 's3 gate closed', () => { })
    return
  }

  const basePrefix = randomNamespace('omt_storage')
  const uploaded: string[] = []

  afterAll(async () => { await removeObjects(basePrefix, uploaded) })

  test('uploads under <basePrefix>/<prefix> and answers the public URL', async () => {
    const { storage } = await boot(basePrefix)
    const bucket = makeStorageBucketModel(bucketConfig(basePrefix))

    const stored = await storage.create({ prefix: 'images/dot.png', stream: Readable.from([PNG]), size: PNG.length, type: 'image/png' })
    uploaded.push('images/dot.png')

    expect(stored.url).toBe(bucket.urlOf('images/dot.png'))
    expect(stored.stream).toBeUndefined()

    const client = bucket.createClient()
    try {
      const head = await client.send(new HeadObjectCommand({ Bucket: bucket.bucket, Key: bucket.keyOf('images/dot.png') }))
      expect(head.ContentType).toBe('image/png')
      expect(head.ContentLength).toBe(PNG.length)
    } finally {
      client.destroy()
    }
  }, 60_000)

  test('refuses a declared type the bytes do not carry', async () => {
    const { storage } = await boot(basePrefix)

    await expect(storage.create({ prefix: 'images/fake.jpg', stream: Readable.from([PNG]), size: PNG.length, type: 'image/jpeg' }))
      .rejects.toBeInstanceOf(FileTypeError)
  }, 60_000)
})
