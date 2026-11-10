import { describe, expect, test } from 'bun:test'
import { FilePropertyError } from '@owlmeans/storage-common'
import { DEFAULT_STORAGE_ACL, DEFAULT_STORAGE_REGION, makeStorageBucketModel } from '../src/index.js'
import type { StorageConfig } from '../src/index.js'

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
    expect(bucket.keyOf('a/b.png')).toBe('tenant/a/b.png')
    expect(bucket.urlOf('a/b.png')).toBe('https://media.s3.eu-central-1.amazonaws.com/tenant/a/b.png')
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

  test('keeps a secret that contains a colon whole', async () => {
    const client = makeStorageBucketModel({
      url: 'b.s3.example.com', apiKey: 'key:se:cret', basePrefix: 'p',
    }).createClient()
    try {
      const credentials = await client.config.credentials()
      expect(credentials.accessKeyId).toBe('key')
      expect(credentials.secretAccessKey).toBe('se:cret')
    } finally {
      client.destroy()
    }
  })

  test('refuses an entry it cannot address', () => {
    const broken: unknown[] = [
      undefined,
      { url: 'b.s3.example.com', apiKey: 'no-colon', basePrefix: 'p' },
      { apiKey: 'k:s', basePrefix: 'p' },
      { url: 'bucket-only', apiKey: 'k:s', basePrefix: 'p' },
    ]
    for (const config of broken) {
      expect(() => makeStorageBucketModel(config as StorageConfig)).toThrow(FilePropertyError)
    }
  })
})
