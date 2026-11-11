import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdirSync, readFileSync, symlinkSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { UploadedFileStatus, UploadReason, UploadSessionStatus } from '@owlmeans/upload'
import { uploadInputHelper } from '../src/index.js'
import type { UploadFileProgress, UploadOverallProgress } from '../src/index.js'
import { uploadPathHelper } from '../src/node.js'
import { makeClientHarness, MiB } from './context.js'
import type { ClientHarness } from './context.js'

const MARKDOWN = Buffer.from('# Brief\n\nA landing page.\n')
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64',
)
const text = (bytes: number): Buffer => Buffer.from('x'.repeat(bytes))

describe('@owlmeans/client-upload', () => {
  let h: ClientHarness

  beforeAll(async () => { h = await makeClientHarness('client') })
  afterAll(async () => { await h?.close() })

  test('uploads Blobs, bytes, streams and factories concurrently, with per-file and overall progress', async () => {
    const session = await h.uploads.open()
    const big = text(3 * MiB)
    const events: Array<[UploadFileProgress, UploadOverallProgress]> = []
    let inFlight = 0
    let peak = 0
    const results = await h.uploads.upload(session.id, [
      { path: 'brand/logo.png', body: new Blob([PNG], { type: 'image/png' }) },
      { path: 'docs/big.md', body: big },
      { path: 'docs/stream.md', body: Readable.from([MARKDOWN]), size: MARKDOWN.length },
      { path: 'docs/factory.md', body: () => Readable.from([MARKDOWN]), size: MARKDOWN.length },
    ], {
      concurrency: 2,
      onProgress: (file, overall) => {
        events.push([file, overall])
        if (file.state === 'sending' && file.loaded === 0) peak = Math.max(peak, ++inFlight)
        if (file.state === 'done' || file.state === 'failed') inFlight -= 1
      },
    })

    expect(results.map(result => [result.index, result.path, result.files[0]?.status])).toEqual([
      [0, 'brand/logo.png', UploadedFileStatus.Accepted],
      [1, 'docs/big.md', UploadedFileStatus.Accepted],
      [2, 'docs/stream.md', UploadedFileStatus.Accepted],
      [3, 'docs/factory.md', UploadedFileStatus.Accepted],
    ])
    expect(peak).toBeLessThanOrEqual(2)
    const done = events.filter(([file]) => file.state === 'done')
    expect(done.map(([file]) => file.index).sort()).toEqual([0, 1, 2, 3])
    expect(done.find(([file]) => file.index === 1)?.[0]).toMatchObject({ loaded: big.length, total: big.length })
    expect(events.some(([file]) => file.index === 1 && file.state === 'sending' && file.loaded > 0)).toBe(true)
    const last = events.at(-1)![1]
    expect(last).toMatchObject({ settled: 4, count: 4 })
    expect(last.loaded).toBe(last.total)
    expect(readFileSync(join(h.delivered, session.id, 'docs/big.md')).equals(big)).toBe(true)
  })

  test('the precheck keeps what cannot pass from being sent', async () => {
    const session = await h.uploads.open()
    await h.uploads.upload(session.id, [{ path: 'docs/a.md', body: MARKDOWN }])
    const results = await h.uploads.upload(session.id, [
      { path: '../escape.md', body: MARKDOWN },
      { path: 'DOCS/A.md', body: MARKDOWN },
      { path: 'too-big.md', body: text(4 * MiB + 1) },
      { path: 'fine.md', body: MARKDOWN },
    ])

    expect(results.map(result => result.refused ?? null)).toEqual([UploadReason.PathInvalid, UploadReason.Duplicate, UploadReason.Limits, null])
    expect(results[0].files).toEqual([])
    const state = await h.uploads.state(session.id)
    expect(state.files.map(file => file.path)).toEqual(['docs/a.md', 'fine.md'])
  })

  test('a failed delivery is retried for a reusable body, never for a one-shot stream', async () => {
    const session = await h.uploads.open()
    const results = await h.uploads.upload(session.id, [
      { path: 'flaky/again.md', body: MARKDOWN },
      { path: 'flaky/once.md', body: Readable.from([MARKDOWN]), size: MARKDOWN.length },
    ], { retries: 2 })

    expect(results[0].files[0]?.status).toBe(UploadedFileStatus.Accepted)
    expect(results[1]).toMatchObject({ files: [], status: 500 })
    expect(h.failed).toEqual(expect.arrayContaining(['flaky/again.md', 'flaky/once.md']))
  })

  test('an abort stops what is in flight and what is queued; the server keeps nothing of it', async () => {
    const session = await h.uploads.open()
    const abort = new AbortController()
    const slow = (): Readable => Readable.from((async function * () {
      for (let sent = 0; sent < 1024 * 1024; sent += 16 * 1024) {
        yield Buffer.alloc(16 * 1024, 0x61)
        if (sent >= 64 * 1024) abort.abort()
        await new Promise(resolve => setTimeout(resolve, 10))
      }
    })())
    const results = await h.uploads.upload(session.id, [
      { path: 'slow.md', body: slow, size: 1024 * 1024 },
      { path: 'queued.md', body: MARKDOWN },
    ], { concurrency: 1, signal: abort.signal })

    expect(results.every(result => result.error != null && result.files.length === 0)).toBe(true)
    const deadline = Date.now() + 5000
    while ((await h.service.get(session.id)).reserved.files !== 0 && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20))
    const state = await h.service.get(session.id)
    expect(state.reserved).toEqual({ files: 0, bytes: 0 })
    expect(state.files).toEqual([])
  })

  test('fromFiles keeps a picked folder\'s paths; remove, seal and abort go through the client', async () => {
    const file = (name: string, relative: string, body: Uint8Array, type = ''): File => {
      const picked = new File([body], name, { type })
      if (relative !== '') Object.defineProperty(picked, 'webkitRelativePath', { value: relative })
      return picked
    }
    const inputs = uploadInputHelper.fromFiles([file('a.md', 'site/docs/a.md', MARKDOWN), file('logo.png', '', PNG, 'image/png')])
    expect(inputs.map(input => [input.path, input.size, input.type ?? null])).toEqual([
      ['site/docs/a.md', MARKDOWN.length, null], ['logo.png', PNG.length, 'image/png'],
    ])

    const session = await h.uploads.open()
    const [a] = await h.uploads.upload(session.id, inputs)
    const removed = await h.uploads.remove(session.id, a.files[0].id)
    expect(removed.files.map(known => known.path)).toEqual(['logo.png'])
    expect((await h.uploads.seal(session.id)).status).toBe(UploadSessionStatus.Sealed)

    const other = await h.uploads.open()
    expect((await h.uploads.abort(other.id)).status).toBe(UploadSessionStatus.Aborted)
  })

  test('fromPaths walks a folder (symlinks skipped) and its inputs upload from disk', async () => {
    const folder = join(h.base, 'materials')
    mkdirSync(join(folder, 'docs', 'deep'), { recursive: true })
    writeFileSync(join(folder, 'docs', 'brief.md'), MARKDOWN)
    writeFileSync(join(folder, 'docs', 'deep', 'notes.md'), MARKDOWN)
    writeFileSync(join(folder, 'logo.png'), PNG)
    symlinkSync(join(folder, 'logo.png'), join(folder, 'link.png'))
    writeFileSync(join(h.base, 'single.md'), MARKDOWN)

    const inputs = await uploadPathHelper.fromPaths([folder, join(h.base, 'single.md')])
    expect(inputs.map(input => [input.path, input.size])).toEqual([
      ['materials/docs/brief.md', MARKDOWN.length], ['materials/docs/deep/notes.md', MARKDOWN.length],
      ['materials/logo.png', PNG.length], ['single.md', MARKDOWN.length],
    ])
    expect((await uploadPathHelper.fromPaths([folder], { base: folder })).map(input => input.path))
      .toEqual(['docs/brief.md', 'docs/deep/notes.md', 'logo.png'])

    const session = await h.uploads.open()
    const results = await h.uploads.upload(session.id, inputs)
    expect(results.map(result => result.files[0]?.status)).toEqual(Array(4).fill(UploadedFileStatus.Accepted))
    expect(readFileSync(join(h.delivered, session.id, 'materials/logo.png'))).toEqual(PNG)
  })
})
