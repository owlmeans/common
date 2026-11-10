import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import {
  archiveHelper, createBufferSource, createStreamSource, FileKind, makeWorkloadSink, transferHelper, WORKLOAD_MAX_FILE_BYTES, WorkloadError,
} from '../src/index.js'
import { noise, PNG, tgzOf } from './fixtures.js'
import { startOrigin } from './harness/origin.js'
import type { Origin } from './harness/origin.js'
import { startWorkload, workloadWriter } from './harness/workload.js'
import type { LocalWorkload } from './harness/workload.js'
import { localClient, removeDir, tempDir } from './context.js'

describe('@owlmeans/file-streams — Viable workload destination', () => {
  let origin: Origin
  let sandbox: string
  let workload: LocalWorkload
  beforeAll(async () => {
    origin = startOrigin()
    origin.files.set('hero.png', { bytes: PNG, type: 'image/png' })
    sandbox = await tempDir('sandbox')
    workload = startWorkload(sandbox)
  })
  afterAll(async () => {
    origin.stop()
    workload.stop()
    await removeDir(sandbox)
  })

  test('downloads an image into the target project through the writeBinaryFile contract', async () => {
    const sink = makeWorkloadSink(workloadWriter(workload.url), { root: 'sources/web/public/media' })
    const result = await transferHelper.copy(localClient().source(origin.url('/files/hero.png')), sink.entry('hero.png'), {
      verify: { allow: [FileKind.Image] },
    })
    expect(result.sink).toMatchObject({ kind: 'workload', location: 'sources/web/public/media/hero.png', bytes: PNG.length })
    expect(await readFile(join(sandbox, 'sources/web/public/media/hero.png'))).toEqual(PNG)
  })

  test('takes exactly its ceiling and refuses one byte more, before or during the read', async () => {
    const lowered = makeWorkloadSink(workloadWriter(workload.url), { root: 'limits', maxFileBytes: 1024 })
    await expect(lowered.entry('lowered.bin').write({ stream: Readable.from([noise(1025)]), info: { origin: 'test' } }))
      .rejects.toThrow('workload:too-large')
    const sink = makeWorkloadSink(workloadWriter(workload.url), { root: 'limits' })
    const exact = noise(WORKLOAD_MAX_FILE_BYTES)
    await sink.entry('exact.bin').write({ stream: Readable.from([exact]), info: { origin: 'test', size: exact.length } })
    expect((await readFile(join(sandbox, 'limits/exact.bin'))).length).toBe(WORKLOAD_MAX_FILE_BYTES)

    const before = workload.commands
    const over = noise(WORKLOAD_MAX_FILE_BYTES + 1)
    await expect(transferHelper.copy(createBufferSource(over, { name: 'over.bin' }), sink.entry('over.bin'), { verify: false }))
      .rejects.toBeInstanceOf(WorkloadError)
    await expect(transferHelper.copy(createStreamSource(Readable.from([over.subarray(0, 8_000_000), over.subarray(8_000_000)])), sink.entry('over-stream.bin'), { verify: false }))
      .rejects.toThrow('workload:too-large')
    expect(workload.commands).toBe(before)
  }, 60_000)

  test('fans an archive out into one atomic write per file, skipping what does not fit', async () => {
    const archive = await tgzOf([
      { name: 'media/cover.png', data: PNG },
      { name: 'media/clip.bin', data: noise(13 * 1024 * 1024) },
      { name: 'media/notes.txt', data: 'notes' },
    ])
    const result = await archiveHelper.extract(createBufferSource(archive, { name: 'media.tar.gz' }), makeWorkloadSink(workloadWriter(workload.url), { root: 'assets' }), {
      onEntryError: 'skip',
    })
    expect(result.extracted.map(entry => entry.path)).toEqual(['media/cover.png', 'media/notes.txt'])
    expect(result.skipped.map(entry => [entry.entry.path, entry.reason])).toEqual([['media/clip.bin', 'file-streams:workload:too-large']])
    expect(await readFile(join(sandbox, 'assets/media/notes.txt'), 'utf8')).toBe('notes')

    const sink = makeWorkloadSink(workloadWriter(workload.url))
    expect(() => sink.entry('../outside.txt')).toThrow('path:traversal')
  }, 60_000)

  test('retries a failed write once', async () => {
    const before = workload.commands
    workload.failNext(1)
    const sink = makeWorkloadSink(workloadWriter(workload.url), { root: 'retry' })
    await sink.entry('again.txt').write({ stream: Readable.from([Buffer.from('second time lucky')]), info: { origin: 'test' } })
    expect(workload.commands - before).toBe(2)
    workload.failNext(2)
    await expect(sink.entry('never.txt').write({ stream: Readable.from([Buffer.from('x')]), info: { origin: 'test' } })).rejects.toThrow('workload:write-failed')
  })
})
