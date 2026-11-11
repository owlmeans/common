import { randomBytes } from 'node:crypto'
import { createServer } from 'node:net'
import type { AddressInfo } from 'node:net'
import { Readable } from 'node:stream'
import { DeleteBucketCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3'
import type { HeadObjectCommandOutput } from '@aws-sdk/client-s3'
import { config, makeServerContext } from '@owlmeans/server-context'
import { gateHelper } from '@owlmeans/test-integration'
import type { IntegrationGate, S3Env } from '@owlmeans/test-integration'
import { appendStorageResource, makeStorageBucketModel } from '../src/index.js'
import type { Config, Context, StorageConfig, StorageResource } from '../src/index.js'

/** S3 gate. Empty variables mean the S3 specs print a skip — never a failure. */
export const s3: IntegrationGate<S3Env> = gateHelper.s3Gate()

export const TEST_ALIAS = 'storage-tests'

/** A 1×1 png. */
export const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
)

/** A 64-bit little-endian ELF executable header (x86-64). */
export const ELF = (() => {
  const header = Buffer.alloc(64)
  header.set([0x7f, 0x45, 0x4c, 0x46, 2, 1, 1, 0], 0)
  header.writeUInt16LE(2, 16)
  header.writeUInt16LE(0x3e, 18)
  header.writeUInt32LE(1, 20)
  return header
})()

export const MARKDOWN = Buffer.from('# Release notes\n\n- Streaming uploads\n- Bucket ensure\n')

/** A random name inside the test bucket's family (`<S3_TEST_BUCKET>-<hex>`), which the key's policy admits. */
export const randomBucketName = (): string => `${s3.env.S3_TEST_BUCKET as string}-${randomBytes(4).toString('hex')}`

/** The test bucket as a storage entry: explicit endpoint, path-style for anything but AWS, no ACL. */
export const bucketConfig = (basePrefix?: string, overrides: Partial<StorageConfig> = {}): StorageConfig => {
  const endpoint = s3.env.S3_ENDPOINT as string
  return {
    endpoint,
    bucket: s3.env.S3_TEST_BUCKET as string,
    region: s3.env.S3_REGION ?? 'us-east-1',
    forcePathStyle: !/\.amazonaws\.com/.test(endpoint),
    accessKeyId: s3.env.S3_KEY as string,
    secretAccessKey: s3.env.S3_SECRET as string,
    ...(basePrefix != null ? { basePrefix } : {}),
    acl: false,
    ...overrides,
  }
}

export interface Booted {
  context: Context
  storage: StorageResource
}

/** Real server context and resource registration — the path a server app takes. */
export const boot = async (entry: StorageConfig): Promise<Booted> => {
  const cfg = config('storage-resource-tests') as Config
  cfg.storageBuckets = { [TEST_ALIAS]: entry }

  const context = makeServerContext(cfg) as Context
  appendStorageResource(context, TEST_ALIAS)

  context.configure()
  await context.init()

  return { context, storage: context.resource<StorageResource>(TEST_ALIAS) }
}

/** A loopback port nothing listens on: connections to it are refused at once. */
export const closedPort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo
  await new Promise<void>(resolve => server.close(() => resolve()))
  return port
}

/** An entry addressing a store that refuses every connection. */
export const unreachableConfig = async (overrides: Partial<StorageConfig> = {}): Promise<StorageConfig> => ({
  endpoint: `http://127.0.0.1:${await closedPort()}`,
  bucket: 'unreachable',
  region: 'us-east-1',
  forcePathStyle: true,
  apiKey: 'key:secret',
  acl: false,
  maxAttempts: 1,
  timeouts: { connectMs: 2_000, requestMs: 5_000 },
  ...overrides,
})

export const streamOf = (bytes: Uint8Array): Readable => Readable.from([Buffer.from(bytes)])

/** The stored object's head, or `null` when there is none. */
export const headObject = async (entry: StorageConfig, prefix: string): Promise<HeadObjectCommandOutput | null> => {
  const bucket = makeStorageBucketModel(entry)
  const client = bucket.createClient()
  try {
    return await client.send(new HeadObjectCommand({ Bucket: bucket.bucket, Key: bucket.keyOf(prefix) }))
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
      return null
    }
    throw error
  } finally {
    client.destroy()
  }
}

/** Removes the objects a spec uploaded. */
export const removeObjects = async (entry: StorageConfig, prefixes: string[]): Promise<void> => {
  const bucket = makeStorageBucketModel(entry)
  const client = bucket.createClient()
  try {
    for (const prefix of prefixes) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket.bucket, Key: bucket.keyOf(prefix) }))
    }
  } finally {
    client.destroy()
  }
}

/** Removes empty buckets a spec created; absent ones are skipped. */
export const removeBuckets = async (names: string[]): Promise<void> => {
  for (const name of names) {
    const bucket = makeStorageBucketModel(bucketConfig(undefined, { bucket: name }))
    const client = bucket.createClient()
    try {
      await client.send(new DeleteBucketCommand({ Bucket: name }))
    } catch (error) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) {
        throw error
      }
    } finally {
      client.destroy()
    }
  }
}
