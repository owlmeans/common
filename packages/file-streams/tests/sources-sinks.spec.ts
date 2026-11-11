import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, readdir, readFile, symlink, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import {
  createBufferSink, createBufferSource, createDirectorySink, createFileSink, createFileSource, createStreamSource, LimitError, PathError,
  SourceError,
} from '../src/index.js'
import { PNG } from './fixtures.js'
import { removeDir, tempDir } from './context.js'

const text = async (stream: Readable): Promise<string> => {
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(chunk as Buffer)
  return Buffer.concat(chunks).toString()
}

describe('@owlmeans/file-streams — sources and sinks', () => {
  let dir: string
  beforeEach(async () => { dir = await tempDir('sinks') })
  afterEach(async () => { await removeDir(dir) })

  test('a file source answers info, whole and ranged opens and random access', async () => {
    const path = join(dir, 'data.txt')
    await writeFile(path, '0123456789')
    const source = createFileSource(path)

    const info = await source.info()
    expect(info).toMatchObject({ name: 'data.txt', size: 10, origin: path })
    expect(info.etag).toBeString()
    expect(await text((await source.open()).stream)).toBe('0123456789')
    const ranged = await source.open({ range: { start: 2, end: 5 } })
    expect(await text(ranged.stream)).toBe('2345')
    expect(ranged.range).toEqual({ start: 2, end: 5, total: 10 })
    const reader = await source.ranges()
    expect(Buffer.from(await reader!.read(7, 10)).toString()).toBe('789')
    await reader!.close()

    await expect(createFileSource(join(dir, 'missing')).info()).rejects.toBeInstanceOf(SourceError)
    await expect(createFileSource(dir).info()).rejects.toThrow('source:not-a-file')
  })

  test('buffer sources reopen; stream sources are one-shot', async () => {
    const buffer = createBufferSource(PNG, { name: 'dot.png' })
    expect((await buffer.info()).size).toBe(PNG.length)
    expect((await (await buffer.ranges())!.read(1, 3))).toEqual(new Uint8Array(PNG.subarray(1, 4)))

    const stream = createStreamSource(Readable.from([Buffer.from('once')]), { name: 'x.txt' })
    expect(await stream.ranges()).toBeNull()
    expect(await text((await stream.open()).stream)).toBe('once')
    await expect(stream.open()).rejects.toThrow('source:consumed')
  })

  test('a file sink commits atomically, refuses to clobber, and leaves nothing on failure', async () => {
    const path = join(dir, 'out', 'file.txt')
    const result = await createFileSink(path).write({ stream: Readable.from([Buffer.from('first')]), info: { origin: 'test' } })
    expect(result).toMatchObject({ kind: 'file', bytes: 5, location: path })
    expect(await readFile(path, 'utf8')).toBe('first')

    await expect(createFileSink(path).write({ stream: Readable.from([Buffer.from('second')]), info: { origin: 'test' } }))
      .rejects.toThrow('path:exists')
    await createFileSink(path, { onConflict: 'overwrite' }).write({ stream: Readable.from([Buffer.from('second')]), info: { origin: 'test' } })
    expect(await readFile(path, 'utf8')).toBe('second')

    const failing = new Readable({ read () { this.destroy(new Error('boom')) } })
    await expect(createFileSink(join(dir, 'out', 'broken.txt')).write({ stream: failing, info: { origin: 'test' } })).rejects.toThrow('boom')
    expect((await readdir(join(dir, 'out'))).sort()).toEqual(['file.txt'])

    const limited = createFileSink(join(dir, 'out', 'big.txt'))
    await expect(limited.write({ stream: Readable.from([Buffer.alloc(100)]), info: { origin: 'test' } }, { maxBytes: 10 }))
      .rejects.toBeInstanceOf(LimitError)
    expect((await readdir(join(dir, 'out'))).sort()).toEqual(['file.txt'])
  })

  test('a directory sink confines entries, refuses duplicates and symlinked parents', async () => {
    const tree = createDirectorySink(join(dir, 'tree'))
    await tree.entry('a/b/c.txt').write({ stream: Readable.from([Buffer.from('c')]), info: { origin: 'test' } })
    expect(await readFile(join(dir, 'tree', 'a', 'b', 'c.txt'), 'utf8')).toBe('c')

    for (const bad of ['../escape.txt', '/etc/passwd', 'a/../../x', 'C:\\x', 'nul\u0000.txt']) {
      expect(() => tree.entry(bad)).toThrow(PathError)
    }
    expect(() => tree.entry('A/B/C.TXT')).toThrow('path:duplicate')

    await mkdir(join(dir, 'outside'))
    await mkdir(join(dir, 'linked'))
    await symlink(join(dir, 'outside'), join(dir, 'linked', 'link'))
    const linked = createDirectorySink(join(dir, 'linked'))
    await expect(linked.entry('link/x.txt').write({ stream: Readable.from([Buffer.from('x')]), info: { origin: 'test' } }))
      .rejects.toThrow('path:symlink')
    expect(await readdir(join(dir, 'outside'))).toEqual([])

    const sink = createBufferSink({ maxBytes: 4 })
    await expect(sink.write({ stream: Readable.from([Buffer.from('too long')]), info: { origin: 'test' } })).rejects.toBeInstanceOf(LimitError)
  })
})
