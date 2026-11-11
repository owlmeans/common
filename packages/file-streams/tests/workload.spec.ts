import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import {
  archiveHelper, createBufferSource, createDirectorySink, createStreamSource, createWorkspace, fileInspector, FileKind, makeWorkloadSink,
  makeWorkloadSource, transferHelper, WORKLOAD_MAX_FILE_BYTES, WorkloadError,
} from '../src/index.js'
import { streamUtils } from '../src/utils/streams.js'
import { docxOf, noise, PNG, tgzOf, zipOf } from './fixtures.js'
import { startOrigin } from './harness/origin.js'
import type { Origin } from './harness/origin.js'
import { startWorkload, workloadReader, workloadWriter } from './harness/workload.js'
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

  test('reads a placed file back through the readBinaryFile contract: re-openable, sized after the first read, ranged', async () => {
    const payload = noise(300_000, 7)
    await makeWorkloadSink(workloadWriter(workload.url), { root: 'docs/materials' }).entry('notes/payload.bin')
      .write({ stream: Readable.from([payload]), info: { origin: 'test' } })
    const materials = makeWorkloadSource(workloadReader(workload.url), { root: 'docs/materials' })
    const source = materials.entry('notes/payload.bin')
    expect(await source.info()).toMatchObject({ origin: 'docs/materials/notes/payload.bin', name: 'payload.bin' })
    expect((await source.info()).size).toBeUndefined()

    const before = workload.commands
    expect((await streamUtils.collect((await source.open()).stream, 1_000_000)).equals(payload)).toBe(true)
    expect((await source.info()).size).toBe(payload.length)
    const ranged = await source.open({ range: { start: 10, end: 19 } })
    expect(ranged.range).toEqual({ start: 10, end: 19, total: payload.length })
    expect((await streamUtils.collect(ranged.stream, 100)).equals(payload.subarray(10, 20))).toBe(true)
    expect(workload.commands - before).toBe(2)
  })

  test('copies a workload file into agent tmp, verified, and reads an archive from the workload by random access', async () => {
    await mkdir(join(sandbox, 'assets'), { recursive: true })
    await writeFile(join(sandbox, 'assets/logo.png'), PNG)
    await writeFile(join(sandbox, 'assets/brief.docx'), await docxOf())
    await writeFile(join(sandbox, 'assets/kit.zip'), await zipOf([{ name: 'kit/a.png', data: PNG }, { name: 'kit/b.txt', data: 'b' }]))
    const assets = makeWorkloadSource(workloadReader(workload.url), { root: 'assets' })

    const root = await tempDir('workload-tmp')
    try {
      const local = createWorkspace({ root }).scope({ organization: 'acme', project: 'slot-1', purpose: 'materials' })
      const copied = await transferHelper.copy(assets.entry('logo.png'), local.entry('logo.png'), { verify: { allow: [FileKind.Image] } })
      expect(copied.verdict?.detected?.kind).toBe(FileKind.Image)
      expect(await readFile(join(local.dir, 'logo.png'))).toEqual(PNG)

      expect(await fileInspector.probe(assets.entry('brief.docx'))).toMatchObject({ status: 'match', detected: { ext: 'docx' } })
      const extracted = await archiveHelper.extract(assets.entry('kit.zip'), createDirectorySink(join(root, 'kit')))
      expect(extracted.extracted.map(entry => entry.path)).toEqual(['kit/a.png', 'kit/b.txt'])
    } finally {
      await removeDir(root)
    }
  })

  test('refuses a file above its ceiling, a missing file after one retry, and an escaping path', async () => {
    await mkdir(join(sandbox, 'big'), { recursive: true })
    await writeFile(join(sandbox, 'big/one-k.bin'), noise(1025))
    const lowered = makeWorkloadSource(workloadReader(workload.url), { root: 'big', maxFileBytes: 1024 })
    await expect(lowered.entry('one-k.bin').open()).rejects.toThrow('workload:too-large')

    const before = workload.commands
    const source = makeWorkloadSource(workloadReader(workload.url))
    await expect(source.entry('missing/nothing.bin').open()).rejects.toThrow('workload:read-failed')
    expect(workload.commands - before).toBe(2)
    await expect(source.entry('missing/nothing.bin').open()).rejects.toBeInstanceOf(WorkloadError)
    expect(() => source.entry('../outside.txt')).toThrow('path:traversal')
  })
})
