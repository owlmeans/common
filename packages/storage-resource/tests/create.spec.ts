import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Readable } from 'node:stream'
import { FileTypeError, StorageApiError } from '@owlmeans/storage-common'
import { randomNamespace } from '@owlmeans/test-integration'
import { makeStorageBucketModel } from '../src/index.js'
import type { StorageConfig, StorageResource } from '../src/index.js'
import { ELF, MARKDOWN, PNG, boot, bucketConfig, headObject, removeObjects, s3, streamOf } from './context.js'
import { startCountingProxy } from './harness/counting-proxy.js'

const MIB = 1024 * 1024
const BIG = 12 * MIB
const CHUNK = 64 * 1024
/** Buffering the body whole would put all 12 MiB in the process before the first byte left it. */
const MAX_LEAD = 8 * MIB

describe('@owlmeans/storage-resource — upload', () => {
  if (s3.skip) {
    test.skip(s3.reason ?? 's3 gate closed', () => { })
    return
  }

  const basePrefix = randomNamespace('omt_storage')
  // The resource ensures the shared test bucket while the context initializes.
  const entry: StorageConfig = bucketConfig(basePrefix, { ensure: true, timeouts: { connectMs: 5_000, requestMs: 120_000 } })
  const uploaded: string[] = []
  let storage: StorageResource

  beforeAll(async () => {
    storage = (await boot(entry)).storage
  }, 60_000)

  afterAll(async () => { await removeObjects(entry, uploaded) })

  test('uploads a png under <basePrefix>/<prefix> and answers the public URL', async () => {
    const stored = await storage.create({ prefix: 'images/dot.png', stream: streamOf(PNG), size: PNG.length, type: 'image/png', name: 'dot.png' })
    uploaded.push('images/dot.png')

    expect(stored.url).toBe(makeStorageBucketModel(entry).urlOf('images/dot.png'))
    expect(stored.stream).toBeUndefined()

    const head = await headObject(entry, 'images/dot.png')
    expect(head?.ContentType).toBe('image/png')
    expect(head?.ContentLength).toBe(PNG.length)
    expect(head?.ContentDisposition).toBe('inline')
  }, 60_000)

  test('uploads a markdown file, a text type no signature recognizes', async () => {
    await storage.create({ prefix: 'docs/notes.md', stream: streamOf(MARKDOWN), size: MARKDOWN.length, type: 'text/markdown', name: 'notes.md' })
    uploaded.push('docs/notes.md')

    const head = await headObject(entry, 'docs/notes.md')
    expect(head?.ContentType).toBe('text/markdown')
    expect(head?.ContentLength).toBe(MARKDOWN.length)
  }, 60_000)

  test('stores scripted svg as an attachment, never inline', async () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(2)</script></svg>')
    await storage.create({ prefix: 'images/active.svg', stream: streamOf(svg), size: svg.length, type: 'image/svg+xml', name: 'active.svg' })
    uploaded.push('images/active.svg')

    expect((await headObject(entry, 'images/active.svg'))?.ContentDisposition).toBe('attachment')
  }, 60_000)

  test('refuses a png claimed as a pdf and an executable, storing nothing', async () => {
    await expect(storage.create({ prefix: 'refused/fake.pdf', stream: streamOf(PNG), size: PNG.length, type: 'application/pdf' }))
      .rejects.toBeInstanceOf(FileTypeError)
    await expect(storage.create({ prefix: 'refused/tool', stream: streamOf(ELF), size: ELF.length, type: 'application/octet-stream', name: 'tool' }))
      .rejects.toBeInstanceOf(FileTypeError)

    expect(await headObject(entry, 'refused/fake.pdf')).toBeNull()
    expect(await headObject(entry, 'refused/tool')).toBeNull()
  }, 60_000)

  test('refuses a body shorter or longer than its declared size, storing nothing', async () => {
    await expect(storage.create({ prefix: 'refused/short.png', stream: streamOf(PNG), size: PNG.length + 10, type: 'image/png' }))
      .rejects.toThrow('stored-file:api:body-short')
    await expect(storage.create({ prefix: 'refused/long.png', stream: streamOf(PNG), size: PNG.length - 10, type: 'image/png' }))
      .rejects.toThrow('stored-file:api:body-long')

    expect(await headObject(entry, 'refused/short.png')).toBeNull()
    expect(await headObject(entry, 'refused/long.png')).toBeNull()
  }, 60_000)

  test('keeps keys at the bucket root when the entry has no base prefix', async () => {
    const rootEntry = bucketConfig(undefined)
    const prefix = `${basePrefix}-root/dot.png`
    const { storage: rootStorage } = await boot(rootEntry)
    try {
      const stored = await rootStorage.create({ prefix, stream: streamOf(PNG), size: PNG.length, type: 'image/png' })
      expect(stored.url).toEndWith(`/${s3.env.S3_TEST_BUCKET as string}/${prefix}`)
      expect((await headObject(rootEntry, prefix))?.ContentLength).toBe(PNG.length)
    } finally {
      await removeObjects(rootEntry, [prefix])
    }
  }, 60_000)

  test('streams a 12 MiB body without holding it whole', async () => {
    const proxy = await startCountingProxy(s3.env.S3_ENDPOINT as string)
    const proxied = { ...entry, endpoint: proxy.endpoint }
    let produced = 0
    let maxLead = 0
    let sentWhenProduced = -1
    const body = new Readable({
      read () {
        if (produced >= BIG) {
          sentWhenProduced = proxy.received()
          this.push(null)
          return
        }
        const chunk = Buffer.alloc(CHUNK)
        if (produced === 0) {
          PNG.copy(chunk)
        }
        produced += chunk.length
        maxLead = Math.max(maxLead, produced - proxy.received())
        this.push(chunk)
      },
    })

    try {
      const { storage: proxiedStorage } = await boot(proxied)
      await proxiedStorage.create({ prefix: 'big/stream.png', stream: body, size: BIG, type: 'image/png', name: 'stream.png' })
      uploaded.push('big/stream.png')
    } finally {
      await proxy.close()
    }

    expect(produced).toBe(BIG)
    expect(proxy.received()).toBeGreaterThan(BIG)
    expect(maxLead).toBeLessThan(MAX_LEAD)
    expect(sentWhenProduced).toBeGreaterThan(BIG - MAX_LEAD)
    expect((await headObject(entry, 'big/stream.png'))?.ContentLength).toBe(BIG)
  }, 120_000)

  test('a store that refuses the upload answers StorageApiError', async () => {
    const denied = { ...entry, secretAccessKey: 'wrong-secret', ensure: false }
    const { storage: deniedStorage } = await boot(denied)

    await expect(deniedStorage.create({ prefix: 'refused/denied.png', stream: streamOf(PNG), size: PNG.length, type: 'image/png' }))
      .rejects.toBeInstanceOf(StorageApiError)
  }, 60_000)
})
