import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { FileTypeError } from '@owlmeans/storage-common'
import { createBufferSink, createDirectorySink, createFileSink, createStreamSource, FileKind, LimitError, transferHelper } from '../src/index.js'
import type { FileSink, SinkInput, TransferProgress } from '../src/index.js'
import { HTML_ERROR, noise, PNG } from './fixtures.js'
import { startOrigin } from './harness/origin.js'
import type { Origin } from './harness/origin.js'
import { localClient, removeDir, tempDir } from './context.js'

/** A sink that only records being called. */
const spySink = (): FileSink & { calls: number } => {
  const spy = {
    kind: 'spy',
    calls: 0,
    write: async (input: SinkInput) => {
      spy.calls++
      input.stream.resume()
      return { kind: 'spy', location: 'spy', bytes: 0 }
    },
  }
  return spy
}

describe('@owlmeans/file-streams — transfers', () => {
  let origin: Origin
  let dir: string
  beforeAll(() => {
    origin = startOrigin()
    origin.files.set('photo.png', { bytes: PNG, type: 'image/png' })
    origin.files.set('named.bin', { bytes: Buffer.from('named content'), disposition: 'attachment; filename*=UTF-8\'\'..%2F..%2Fsecret%20plan.txt' })
    origin.files.set('invoice.pdf', { bytes: HTML_ERROR, type: 'text/html' })
    origin.files.set('large.bin', { bytes: noise(2 * 1024 * 1024) })
  })
  afterAll(() => origin.stop())
  beforeEach(async () => { dir = await tempDir('transfer') })
  afterEach(async () => { await removeDir(dir) })

  test('downloads into a folder under the sanitized name the server gives', async () => {
    const client = localClient()
    const named = await transferHelper.copyInto(client.source(origin.url('/files/named.bin')), createDirectorySink(dir))
    expect(named.sink.location).toBe(join(dir, 'secret plan.txt'))
    expect(await readFile(join(dir, 'secret plan.txt'), 'utf8')).toBe('named content')

    const image = await transferHelper.copyInto(client.source(origin.url('/files/photo.png')), createDirectorySink(dir), { verify: { allow: [FileKind.Image] } })
    expect(image.verdict).toMatchObject({ status: 'match', detected: { ext: 'png', kind: FileKind.Image } })
    expect(await readFile(join(dir, 'photo.png'))).toEqual(PNG)
  })

  test('refuses an oversized body before the sink, and mid-stream without leaving a file', async () => {
    const client = localClient()
    const spy = spySink()
    await expect(transferHelper.copy(client.source(origin.url('/files/large.bin')), spy, { limits: { maxBytes: 1024 } })).rejects.toThrow('limit:max-bytes')
    expect(spy.calls).toBe(0)

    const unknown = createStreamSource(Readable.from([noise(4096), noise(4096)]), { name: 'stream.bin' })
    await expect(transferHelper.copy(unknown, createFileSink(join(dir, 'stream.bin')), { limits: { maxBytes: 5000 }, verify: false }))
      .rejects.toBeInstanceOf(LimitError)
    expect(await readdir(dir)).toEqual([])
  })

  test('times out, aborts, reports progress and hashes', async () => {
    const client = localClient({ timeouts: { idleMs: 10_000 } })
    await expect(transferHelper.copy(client.source(origin.url('/stall-body')), createBufferSink(), { limits: { idleTimeoutMs: 200 }, verify: false }))
      .rejects.toThrow('limit:idle-timeout')
    await expect(transferHelper.copy(client.source(origin.url('/stall-body')), createBufferSink(), { limits: { timeoutMs: 200, idleTimeoutMs: 5000 }, verify: false }))
      .rejects.toThrow('limit:timeout')
    const controller = new AbortController()
    setTimeout(() => controller.abort(new Error('stop now')), 100)
    await expect(transferHelper.copy(client.source(origin.url('/stall-body')), createBufferSink(), { signal: controller.signal, verify: false }))
      .rejects.toThrow('stop now')

    const progress: TransferProgress[] = []
    const result = await transferHelper.copy(client.source(origin.url('/files/large.bin')), createFileSink(join(dir, 'large.bin')), {
      onProgress: event => progress.push(event), progressIntervalMs: 0, hash: 'sha256', verify: false,
    })
    expect(result.bytes).toBe(2 * 1024 * 1024)
    expect(result.sha256).toBe(createHash('sha256').update(noise(2 * 1024 * 1024)).digest('hex'))
    expect(progress.at(-1)?.bytes).toBe(2 * 1024 * 1024)
    expect(progress.every((event, index) => index === 0 || event.bytes >= progress[index - 1].bytes)).toBe(true)
  })

  test('verifies the head before a byte reaches the sink', async () => {
    const client = localClient()
    const spy = spySink()
    await expect(transferHelper.copy(client.source(origin.url('/files/invoice.pdf')), spy)).rejects.toBeInstanceOf(FileTypeError)
    expect(spy.calls).toBe(0)
    await expect(transferHelper.copy(client.source(origin.url('/files/photo.png')), spy, { verify: { allow: [FileKind.Pdf] } }))
      .rejects.toBeInstanceOf(FileTypeError)
    expect(spy.calls).toBe(0)

    const unchecked = await transferHelper.copy(client.source(origin.url('/files/invoice.pdf')), createFileSink(join(dir, 'page.html')), { verify: false })
    expect(unchecked.verdict).toBeUndefined()
    expect(await readFile(join(dir, 'page.html'))).toEqual(HTML_ERROR)
  })
})
