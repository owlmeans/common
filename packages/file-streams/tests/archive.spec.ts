import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { gzipSync } from 'node:zlib'
import {
  ArchiveError, ArchiveFormat, archiveHelper, createArchiveHelper, createBufferSink, createBufferSource, createDirectorySink, createFileSource,
  createStreamSource, LimitError, PathError,
} from '../src/index.js'
import type { FileSource } from '../src/index.js'
import { centralRecords, noise, patch, tarOf, tgzOf, zipOf } from './fixtures.js'
import { startOrigin } from './harness/origin.js'
import type { Origin } from './harness/origin.js'
import { localClient, removeDir, tempDir } from './context.js'

const bytesOf = async (source: FileSource): Promise<Buffer> => {
  const sink = createBufferSink({ maxBytes: 64 * 1024 * 1024 })
  await sink.write({ stream: (await source.open()).stream, info: await source.info() })
  return Buffer.from(sink.bytes())
}

const listAll = async (dir: string, prefix = ''): Promise<string[]> => {
  const out: string[] = []
  for (const entry of await readdir(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) out.push(...await listAll(dir, path))
    else out.push(path)
  }
  return out.sort()
}

describe('@owlmeans/file-streams — archives', () => {
  let dir: string
  let origin: Origin
  beforeAll(() => { origin = startOrigin() })
  afterAll(() => origin.stop())
  beforeEach(async () => { dir = await tempDir('archive') })
  afterEach(async () => { await removeDir(dir) })

  test('packs and extracts zip, tar, tar.gz and gz, detecting the format from bytes', async () => {
    const onDisk = join(dir, 'source.bin')
    await writeFile(onDisk, noise(50_000))
    for (const format of [ArchiveFormat.Zip, ArchiveFormat.Tar, ArchiveFormat.TarGz]) {
      const packed = await bytesOf(archiveHelper.pack(format, [
        { path: 'docs/читать.txt', source: Buffer.from('unicode name') },
        { path: 'bin/noise.bin', source: createFileSource(onDisk) },
        { path: 'empty.txt', source: new Uint8Array(0) },
      ]))
      expect(await archiveHelper.detect(createBufferSource(packed))).toBe(format)
      const out = join(dir, `out-${format}`)
      const result = await archiveHelper.extract(createBufferSource(packed, { name: `bundle.${format}` }), createDirectorySink(out))
      expect(result.format).toBe(format)
      expect(await listAll(out)).toEqual(['bin/noise.bin', 'docs/читать.txt', 'empty.txt'])
      expect((await readFile(join(out, 'bin/noise.bin'))).equals(noise(50_000))).toBe(true)
      expect(await readFile(join(out, 'docs/читать.txt'), 'utf8')).toBe('unicode name')
    }

    const gz = archiveHelper.gzip(createBufferSource(Buffer.from('compressed words'), { name: 'notes.txt' }))
    expect((await gz.info()).name).toBe('notes.txt.gz')
    const result = await archiveHelper.extract(gz, createDirectorySink(join(dir, 'gz')))
    expect(result.format).toBe(ArchiveFormat.Gzip)
    expect(await readFile(join(dir, 'gz', 'notes.txt'), 'utf8')).toBe('compressed words')
    const plain = await bytesOf(archiveHelper.gunzip(createBufferSource(gzipSync(Buffer.from('round trip')), { name: 'x.txt.gz' })))
    expect(plain.toString()).toBe('round trip')
  })

  test('lists a remote zip from its central directory, and spools a zip that has no random access', async () => {
    origin.files.set('media.zip', { bytes: await zipOf([{ name: 'video.bin', data: noise(8 * 1024 * 1024), compress: false }, { name: 'cover.png', data: 'png' }]) })
    const entries = await archiveHelper.list(localClient().source(origin.url('/files/media.zip')))
    expect(entries.map(entry => [entry.path, entry.size])).toEqual([['video.bin', 8 * 1024 * 1024], ['cover.png', 3]])
    expect(origin.served.get('media.zip') ?? 0).toBeLessThan(512 * 1024)

    const zip = await zipOf([{ name: 'a/b.txt', data: 'streamed' }])
    const result = await archiveHelper.extract(createStreamSource(Readable.from([zip])), createDirectorySink(join(dir, 'spooled')))
    expect(result.extracted.map(entry => entry.path)).toEqual(['a/b.txt'])
    expect(await readFile(join(dir, 'spooled', 'a', 'b.txt'), 'utf8')).toBe('streamed')
  })

  test('refuses traversal, links, duplicates, encryption, overlaps and lying sizes; nothing escapes', async () => {
    const out = join(dir, 'hostile')
    const tree = (): ReturnType<typeof createDirectorySink> => createDirectorySink(out)
    const extract = async (bytes: Buffer, options = {}): Promise<unknown> => await archiveHelper.extract(createBufferSource(bytes), tree(), options)

    await expect(extract(patch(await zipOf([{ name: 'aa/evil.txt', data: 'x' }]), 'aa/evil.txt', '../evil.txt'))).rejects.toThrow('path:traversal')
    await expect(extract(patch(await zipOf([{ name: 'xetc/passwd', data: 'x' }]), 'xetc/passwd', '/etc/passwd'))).rejects.toBeInstanceOf(PathError)
    await expect(extract(await tarOf([{ name: '../../evil.txt', data: 'x' }]))).rejects.toThrow('path:traversal')
    await expect(extract(await tarOf([{ name: 'bad\u0001name.txt', data: 'x' }]))).rejects.toThrow('path:invalid-char')
    await expect(extract(await tarOf([{ name: 'same.txt', data: '1' }, { name: 'SAME.txt', data: '2' }]))).rejects.toThrow('path:duplicate')

    const links = await tarOf([{ name: 'link', type: 'symlink', linkname: '/etc/passwd' }, { name: 'hard', type: 'link', linkname: 'x' }, { name: 'ok.txt', data: 'ok' }])
    const skipped = await archiveHelper.extract(createBufferSource(links), createDirectorySink(join(dir, 'links')))
    expect(skipped.skipped.map(entry => [entry.entry.path, entry.reason])).toEqual([['link', 'link'], ['hard', 'link']])
    expect(await listAll(join(dir, 'links'))).toEqual(['ok.txt'])
    await expect(extract(links, { links: 'refuse' })).rejects.toBeInstanceOf(ArchiveError)
    const zipLink = await archiveHelper.extract(createBufferSource(await zipOf([{ name: 'link', data: '/etc/passwd', mode: 0o120777 }])), createDirectorySink(join(dir, 'zip-link')))
    expect(zipLink.skipped.map(entry => entry.reason)).toEqual(['link'])

    const encrypted = await zipOf([{ name: 'secret.txt', data: 'x' }])
    encrypted.writeUInt16LE(encrypted.readUInt16LE(6) | 1, 6)
    for (const record of centralRecords(encrypted)) encrypted.writeUInt16LE(encrypted.readUInt16LE(record + 8) | 1, record + 8)
    await expect(extract(encrypted)).rejects.toThrow('archive:encrypted')

    const overlapping = await zipOf([{ name: 'one.txt', data: 'one' }, { name: 'two.txt', data: 'two' }])
    overlapping.writeUInt32LE(0, centralRecords(overlapping)[1] + 42)
    await expect(extract(overlapping)).rejects.toThrow('archive:overlap')

    const lying = await zipOf([{ name: 'lie.txt', data: 'much more than one byte', compress: false }])
    lying.writeUInt32LE(1, centralRecords(lying)[0] + 24)
    await expect(extract(lying)).rejects.toThrow()

    // Each entry commits atomically: what was admitted before a refusal stays, nothing escapes, no temp file remains.
    expect(await listAll(out)).toEqual(['same.txt'])
    expect((await listAll(dir)).filter(path => /evil|passwd|\.tmp$/.test(path))).toEqual([])
  })

  test('stops bombs and entry floods, and follows nested archives only as deep as allowed', async () => {
    const out = createDirectorySink(join(dir, 'bombs'))
    const zeros = Buffer.alloc(20 * 1024 * 1024)
    await expect(archiveHelper.extract(createBufferSource(await zipOf([{ name: 'zeros.bin', data: zeros }])), out)).rejects.toThrow('limit:ratio')
    await expect(archiveHelper.extract(createBufferSource(await tgzOf([{ name: 'zeros.bin', data: zeros }])), out)).rejects.toThrow('limit:ratio')
    await expect(archiveHelper.extract(createBufferSource(gzipSync(zeros)), out)).rejects.toBeInstanceOf(LimitError)
    const flood = await zipOf([{ name: 'a', data: '1' }, { name: 'b', data: '2' }, { name: 'c', data: '3' }])
    await expect(createArchiveHelper({ limits: { maxEntries: 2 } }).extract(createBufferSource(flood), out)).rejects.toThrow('limit:entries')
    await expect(archiveHelper.extract(createBufferSource(await tarOf([{ name: 'big.bin', data: noise(4096) }])), out, { limits: { maxEntryBytes: 1000 } }))
      .rejects.toThrow('limit:entry-bytes')

    const inner = await zipOf([{ name: 'deep.txt', data: 'deep' }])
    const outer = await zipOf([{ name: 'media/inner.zip', data: inner }, { name: 'top.txt', data: 'top' }])
    await archiveHelper.extract(createBufferSource(outer), createDirectorySink(join(dir, 'depth-1')))
    expect(await listAll(join(dir, 'depth-1'))).toEqual(['media/inner.zip', 'top.txt'])
    await archiveHelper.extract(createBufferSource(outer), createDirectorySink(join(dir, 'depth-2')), { limits: { maxDepth: 2 } })
    expect(await listAll(join(dir, 'depth-2'))).toEqual(['media/inner/deep.txt', 'top.txt'])
  }, 60_000)
})
