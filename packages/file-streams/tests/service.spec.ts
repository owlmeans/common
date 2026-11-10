import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FilePropertyError } from '@owlmeans/storage-common'
import { makeStorageBucketModel } from '@owlmeans/storage-resource'
import { createBufferSource, FileKind } from '../src/index.js'
import { streamUtils } from '../src/utils/streams.js'
import { PNG } from './fixtures.js'
import { startOrigin } from './harness/origin.js'
import type { Origin } from './harness/origin.js'
import { startSocksProxy } from './harness/socks5.js'
import type { LocalSocksProxy } from './harness/socks5.js'
import { boot, removeDir, tempDir } from './context.js'

describe('@owlmeans/file-streams — context service', () => {
  let origin: Origin
  let socks: LocalSocksProxy
  let dir: string
  beforeAll(async () => {
    origin = startOrigin()
    origin.files.set('a.txt', { bytes: Buffer.from('configured'), type: 'text/plain' })
    socks = await startSocksProxy()
    dir = await tempDir('service')
  })
  afterAll(async () => {
    origin.stop()
    socks.stop()
    await removeDir(dir)
  })
  afterEach(() => undefined)

  test('builds its HTTP client from config, reading a proxy URL from a secret file', async () => {
    const secret = join(dir, 'proxy-url')
    await writeFile(secret, `socks5://127.0.0.1:${socks.port}\n`)
    const { files } = await boot({ fileStreams: { network: { allowCidrs: ['127.0.0.1/32'] }, proxies: [{ url: secret }] } })

    const response = await files.http().request(origin.url('/files/a.txt'))
    expect((await streamUtils.collect(response.body, 100)).toString()).toBe('configured')
    expect(socks.records.at(-1)).toMatchObject({ atyp: 1, address: '127.0.0.1' })
    expect(files.http()).toBe(files.http())
  })

  test('addresses storage buckets exactly as storage-resource does, without I/O until used', async () => {
    const entry = { url: 'media.s3.eu-central-1.amazonaws.com', apiKey: 'key:secret', basePrefix: 'tenant' }
    const { files } = await boot({ storageBuckets: { media: entry } })
    const bucket = files.bucket('media')
    expect(bucket).toBe(files.bucket('media'))
    expect(bucket.urlOf('a/b.png')).toBe(makeStorageBucketModel(entry).urlOf('a/b.png'))
    expect(bucket.keyOf('a/b.png')).toBe('tenant/a/b.png')
    expect(() => bucket.keyOf('../escape')).toThrow('path:traversal')
    expect(() => files.bucket('unknown')).toThrow(FilePropertyError)
  })

  test('hands out working inspector, transfer and archive objects', async () => {
    const { files } = await boot()
    const verdict = await files.inspector().probe(createBufferSource(PNG, { name: 'dot.png' }))
    expect(verdict.detected?.kind).toBe(FileKind.Image)
    expect(files.transfer()).toBe(files.transfer())
    expect(await files.archives().detect(createBufferSource(PNG))).toBeNull()
  })
})
