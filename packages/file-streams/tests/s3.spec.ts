import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { DeleteObjectCommand, ListMultipartUploadsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3'
import { config, makeServerContext } from '@owlmeans/server-context'
import { appendStorageResource } from '@owlmeans/storage-resource'
import type { StorageResource } from '@owlmeans/storage-resource'
import { randomNamespace } from '@owlmeans/test-integration'
import {
  appendFileStreamsService, archiveHelper, createBufferSource, createFileSink, createS3Bucket, createStreamSource, FILE_STREAMS_SERVICE,
  fileInspector, FileKind, transferHelper,
} from '../src/index.js'
import type { FileStreamsService, S3Bucket } from '../src/index.js'
import { streamUtils } from '../src/utils/streams.js'
import { docxOf, noise, PNG, tgzOf } from './fixtures.js'
import { startOrigin } from './harness/origin.js'
import type { Origin } from './harness/origin.js'
import { bucketConfig, localClient, removeDir, s3, tempDir } from './context.js'
import type { TestConfig } from './context.js'

describe('@owlmeans/file-streams — S3', () => {
  if (s3.skip) {
    test.skip(s3.reason ?? 's3 gate closed', () => { })
    return
  }

  const basePrefix = randomNamespace('omt_file_streams')
  let bucket: S3Bucket
  let origin: Origin
  let dir: string

  beforeAll(async () => {
    bucket = createS3Bucket(bucketConfig(basePrefix), { partSize: 5 * 1024 * 1024 })
    origin = startOrigin()
    origin.files.set('photo.png', { bytes: PNG, type: 'image/png' })
    dir = await tempDir('s3')
  })

  afterAll(async () => {
    const client = bucket.model.createClient()
    try {
      let token: string | undefined
      do {
        const page = await client.send(new ListObjectsV2Command({ Bucket: bucket.model.bucket, Prefix: `${basePrefix}/`, ContinuationToken: token }))
        for (const object of page.Contents ?? []) {
          await client.send(new DeleteObjectCommand({ Bucket: bucket.model.bucket, Key: object.Key }))
        }
        token = page.NextContinuationToken
      } while (token != null)
    } finally {
      client.destroy()
      bucket.close()
      origin.stop()
      await removeDir(dir)
    }
  })

  test('puts an object with its verified type and reads it whole, ranged and by stat', async () => {
    const result = await transferHelper.copy(createBufferSource(PNG, { name: 'shot.png' }), bucket.sink('screens/shot.png'), {
      verify: { allow: [FileKind.Image] },
    })
    expect(result.sink).toMatchObject({ kind: 's3', bytes: PNG.length, mime: 'image/png', url: bucket.urlOf('screens/shot.png') })
    expect(bucket.instanceOf(result.sink, 'original')).toEqual({ size: PNG.length, alias: 'original', url: bucket.urlOf('screens/shot.png') })

    expect(await bucket.head('screens/shot.png')).toMatchObject({ key: `${basePrefix}/screens/shot.png`, size: PNG.length, mime: 'image/png' })
    expect(await bucket.head('screens/missing.png')).toBeNull()
    const source = bucket.source('screens/shot.png')
    expect((await source.info()).size).toBe(PNG.length)
    expect(await streamUtils.collect((await source.open()).stream, 10_000)).toEqual(PNG)
    const reader = await source.ranges()
    expect(Buffer.from(await reader!.read(1, 3))).toEqual(PNG.subarray(1, 4))
  }, 60_000)

  test('uploads a stream of unknown length in parts, and aborts a failed upload', async () => {
    const payload = noise(12 * 1024 * 1024)
    const chunks = Array.from({ length: 12 }, (_, index) => payload.subarray(index * 1024 * 1024, (index + 1) * 1024 * 1024))
    await transferHelper.copy(createStreamSource(Readable.from(chunks), { name: 'noise.bin' }), bucket.sink('big/noise.bin'), { verify: false })
    const head = await bucket.head('big/noise.bin')
    expect(head?.size).toBe(payload.length)
    expect(head?.etag).toContain('-')
    const back = await streamUtils.collect((await bucket.source('big/noise.bin').open()).stream, 20 * 1024 * 1024)
    expect(back.equals(payload)).toBe(true)

    const failing = Readable.from((async function * () {
      for (let index = 0; index < 7; index++) yield noise(1024 * 1024, index)
      throw new Error('source broke')
    })())
    await expect(transferHelper.copy(createStreamSource(failing), bucket.sink('big/broken.bin'), { verify: false })).rejects.toThrow()
    expect(await bucket.head('big/broken.bin')).toBeNull()
    const client = bucket.model.createClient()
    try {
      const uploads = await client.send(new ListMultipartUploadsCommand({ Bucket: bucket.model.bucket, Prefix: `${basePrefix}/big/broken.bin` }))
      expect(uploads.Uploads ?? []).toEqual([])
    } finally {
      client.destroy()
    }
  }, 120_000)

  test('probes by range and moves files between S3, HTTP, folders and archives', async () => {
    await transferHelper.copy(createBufferSource(await docxOf(), { name: 'letter.docx' }), bucket.sink('docs/letter.docx'))
    const verdict = await fileInspector.probe(bucket.source('docs/letter.docx'))
    expect(verdict).toMatchObject({ status: 'match', detected: { ext: 'docx' }, probe: { randomAccess: true } })

    await transferHelper.copy(localClient().source(origin.url('/files/photo.png')), bucket.sink('from-http/photo.png'))
    await transferHelper.copy(bucket.source('from-http/photo.png'), createFileSink(join(dir, 'photo.png')))
    expect(await readFile(join(dir, 'photo.png'))).toEqual(PNG)

    const archive = await tgzOf([{ name: 'media/a.png', data: PNG }, { name: 'media/b.txt', data: 'b' }])
    const extracted = await archiveHelper.extract(createBufferSource(archive), bucket.tree('extracted'))
    expect(extracted.extracted.map(entry => entry.result.location)).toEqual([
      `s3://${bucket.model.bucket}/${basePrefix}/extracted/media/a.png`, `s3://${bucket.model.bucket}/${basePrefix}/extracted/media/b.txt`,
    ])
    expect((await bucket.head('extracted/media/a.png'))?.mime).toBe('image/png')
  }, 60_000)

  test('reads what storage-resource uploaded, by the same config entry, key and URL', async () => {
    const cfg = config('file-streams-s3-tests') as TestConfig
    cfg.storageBuckets = { interop: bucketConfig(basePrefix) }
    const context = makeServerContext(cfg)
    appendStorageResource(context as unknown as Parameters<typeof appendStorageResource>[0], 'interop')
    appendFileStreamsService(context)
    context.configure()
    await context.init()

    const stored = await context.resource<StorageResource>('interop').create({ prefix: 'interop/dot.png', stream: Readable.from([PNG]), size: PNG.length, type: 'image/png' })
    const files = context.service<FileStreamsService>(FILE_STREAMS_SERVICE)
    const same = files.bucket('interop')
    expect(stored.url).toBe(same.urlOf('interop/dot.png'))
    expect(await streamUtils.collect((await same.source('interop/dot.png').open()).stream, 10_000)).toEqual(PNG)
    same.close()
  }, 60_000)
})
