import { describe, expect, test } from 'bun:test'
import { FilePropertyError, StorageApiError } from '@owlmeans/storage-common'
import { DEFAULT_STORAGE_ACL, DEFAULT_STORAGE_REGION, makeStorageBucketModel } from '../src/index.js'
import type { StorageConfig } from '../src/index.js'
import { closedPort } from './context.js'
import { startSilentServer } from './harness/silent-server.js'

const credentialsOf = async (config: StorageConfig): Promise<{ accessKeyId: string, secretAccessKey: string }> => {
  const client = makeStorageBucketModel(config).createClient()
  try {
    const credentials = await client.config.credentials()
    return { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey }
  } finally {
    client.destroy()
  }
}

const rejection = async (promise: Promise<unknown>): Promise<unknown> => {
  try {
    await promise
  } catch (error) {
    return error
  }
  throw new Error('expected a rejection')
}

describe('@owlmeans/storage-resource — bucket model', () => {
  test('reads a legacy entry exactly as the upload always did', () => {
    const bucket = makeStorageBucketModel({
      url: 'media.s3.eu-central-1.amazonaws.com', apiKey: 'key:secret', basePrefix: 'tenant',
    })

    expect(bucket.bucket).toBe('media')
    expect(bucket.endpoint).toBe('https://s3.eu-central-1.amazonaws.com')
    expect(bucket.region).toBe(DEFAULT_STORAGE_REGION)
    expect(bucket.acl).toBe(DEFAULT_STORAGE_ACL)
    expect(bucket.forcePathStyle).toBe(false)
    expect(bucket.basePrefix).toBe('tenant')
    expect(bucket.keyOf('a/b.png')).toBe('tenant/a/b.png')
    expect(bucket.urlOf('a/b.png')).toBe('https://media.s3.eu-central-1.amazonaws.com/tenant/a/b.png')
    expect(bucket.locationConstraint).toBe(DEFAULT_STORAGE_REGION)
    expect(bucket.adminUrl).toBeUndefined()
  })

  test('addresses an explicit endpoint path-style or virtual-host style', () => {
    const pathStyle = makeStorageBucketModel({
      endpoint: 'http://127.0.0.1:9000/', bucket: 'local', apiKey: 'k:s', basePrefix: 'p',
      forcePathStyle: true, region: 'us-east-1', acl: false,
    })
    expect(pathStyle.endpoint).toBe('http://127.0.0.1:9000')
    expect(pathStyle.region).toBe('us-east-1')
    expect(pathStyle.acl).toBeUndefined()
    expect(pathStyle.urlOf('x.txt')).toBe('http://127.0.0.1:9000/local/p/x.txt')

    const virtualHost = makeStorageBucketModel({ endpoint: 'https://s3.example.com', bucket: 'b', apiKey: 'k:s', basePrefix: 'p' })
    expect(virtualHost.urlOf('x.txt')).toBe('https://b.s3.example.com/p/x.txt')

    const published = makeStorageBucketModel({
      endpoint: 'https://s3.example.com', bucket: 'b', apiKey: 'k:s', basePrefix: 'p', publicUrl: 'https://cdn.example.com/',
    })
    expect(published.urlOf('x.txt')).toBe('https://cdn.example.com/p/x.txt')
  })

  test('keeps keys at the bucket root without a base prefix, never with a leading slash', () => {
    for (const basePrefix of [undefined, '']) {
      const bucket = makeStorageBucketModel({
        endpoint: 'http://127.0.0.1:9000', bucket: 'root', apiKey: 'k:s', forcePathStyle: true,
        ...(basePrefix != null ? { basePrefix } : {}),
      })
      expect(bucket.basePrefix).toBe('')
      expect(bucket.keyOf('a/b.png')).toBe('a/b.png')
      expect(bucket.keyOf('//a/b.png')).toBe('a/b.png')
      expect(bucket.urlOf('a/b.png')).toBe('http://127.0.0.1:9000/root/a/b.png')
    }
  })

  test('keeps a secret that contains a colon whole', async () => {
    expect(await credentialsOf({ url: 'b.s3.example.com', apiKey: 'key:se:cret', basePrefix: 'p' }))
      .toEqual({ accessKeyId: 'key', secretAccessKey: 'se:cret' })
  })

  test('takes a full key pair over apiKey, and apiKey over half a pair', async () => {
    const address = { endpoint: 'http://127.0.0.1:9000', bucket: 'b' }

    expect(await credentialsOf({ ...address, accessKeyId: 'id', secretAccessKey: 'se:cret' }))
      .toEqual({ accessKeyId: 'id', secretAccessKey: 'se:cret' })
    expect(await credentialsOf({ ...address, accessKeyId: 'id', secretAccessKey: 'secret', apiKey: 'old:key' }))
      .toEqual({ accessKeyId: 'id', secretAccessKey: 'secret' })
    expect(await credentialsOf({ ...address, accessKeyId: 'id', apiKey: 'old:key' }))
      .toEqual({ accessKeyId: 'old', secretAccessKey: 'key' })
    expect(() => makeStorageBucketModel({ ...address, accessKeyId: 'id' })).toThrow(FilePropertyError)
    expect(() => makeStorageBucketModel({ ...address, secretAccessKey: 'secret', apiKey: '' })).toThrow(FilePropertyError)
  })

  test('exposes the admin URL beside the endpoint, with or without the slashes', () => {
    const address = { endpoint: 'http://rfs-s3.default.svc.cluster.local:9000/', bucket: 'b', apiKey: 'k:s' }
    for (const adminPath of ['rustfs/admin/v3', '/rustfs/admin/v3/']) {
      expect(makeStorageBucketModel({ ...address, adminPath }).adminUrl)
        .toBe('http://rfs-s3.default.svc.cluster.local:9000/rustfs/admin/v3')
    }
    expect(makeStorageBucketModel({ ...address, adminPath: '' }).adminUrl).toBeUndefined()
    expect(makeStorageBucketModel(address).adminUrl).toBeUndefined()
  })

  test('places created buckets in the region, an explicit zone, or none for us-east-1', () => {
    const address = { endpoint: 'http://127.0.0.1:9000', bucket: 'b', apiKey: 'k:s' }

    expect(makeStorageBucketModel(address).locationConstraint).toBe('eu-central-1')
    expect(makeStorageBucketModel({ ...address, region: 'us-east-1' }).locationConstraint).toBeUndefined()
    expect(makeStorageBucketModel({ ...address, region: 'us-east-1', locationConstraint: 'eu-west-1' }).locationConstraint).toBe('eu-west-1')
    expect(makeStorageBucketModel({ ...address, region: 'eu-west-1', locationConstraint: 'us-east-1' }).locationConstraint).toBeUndefined()
  })

  test('builds clients with the entry attempts, overridable per client', async () => {
    const bucket = makeStorageBucketModel({ endpoint: 'http://127.0.0.1:9000', bucket: 'b', apiKey: 'k:s', maxAttempts: 5 })
    const configured = bucket.createClient()
    const single = bucket.createClient({ maxAttempts: 1 })
    try {
      expect(await configured.config.maxAttempts()).toBe(5)
      expect(await single.config.maxAttempts()).toBe(1)
    } finally {
      configured.destroy()
      single.destroy()
    }
  })

  test('answers a refused connection as a StorageApiError with the network code', async () => {
    const bucket = makeStorageBucketModel({
      endpoint: `http://127.0.0.1:${await closedPort()}`, bucket: 'b', apiKey: 'k:s', forcePathStyle: true, maxAttempts: 1,
    })

    const exists = await rejection(bucket.exists())
    expect(exists).toBeInstanceOf(StorageApiError)
    expect((exists as Error).message).toContain('stored-file:api:')

    expect(await rejection(bucket.ensure())).toBeInstanceOf(StorageApiError)
  })

  test('gives up on a store that never answers once the request timeout passes', async () => {
    const silent = await startSilentServer()
    try {
      const bucket = makeStorageBucketModel({
        endpoint: silent.endpoint, bucket: 'b', apiKey: 'k:s', forcePathStyle: true, maxAttempts: 1,
        timeouts: { connectMs: 1_000, requestMs: 300 },
      })
      const started = Date.now()
      const error = await rejection(bucket.exists())

      expect(error).toBeInstanceOf(StorageApiError)
      expect((error as Error).message).toBe('stored-file:api:TimeoutError')
      expect(Date.now() - started).toBeLessThan(5_000)
    } finally {
      await silent.close()
    }
  }, 15_000)

  test('refuses an entry it cannot address', () => {
    const broken: unknown[] = [
      undefined,
      { url: 'b.s3.example.com', apiKey: 'no-colon', basePrefix: 'p' },
      { url: 'b.s3.example.com', basePrefix: 'p' },
      { apiKey: 'k:s', basePrefix: 'p' },
      { url: 'bucket-only', apiKey: 'k:s', basePrefix: 'p' },
    ]
    for (const config of broken) {
      expect(() => makeStorageBucketModel(config as StorageConfig)).toThrow(FilePropertyError)
    }
  })
})
