import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { randomNamespace } from '@owlmeans/test-integration'
import {
  createBackedWorkspace, createBufferSource, createS3Bucket, createWorkspace, FileKind, FileMimicryError, PathError, S3_DELETE_BATCH_SIZE,
  transferHelper,
} from '../src/index.js'
import type { BackedWorkspace, FileScope, S3Bucket } from '../src/index.js'
import { streamUtils } from '../src/utils/streams.js'
import { ELF, MARKDOWN, noise, PNG } from './fixtures.js'
import { boot, bucketConfig, purgeBasePrefix, removeDir, s3, tempDir } from './context.js'

const exists = async (path: string): Promise<boolean> => await stat(path).then(() => true, () => false)

describe('@owlmeans/file-streams — backed workspace and S3 prefixes', () => {
  if (s3.skip) {
    test.skip(s3.reason ?? 's3 gate closed', () => { })
    return
  }

  const basePrefix = randomNamespace('omt_file_streams_backed')
  let bucket: S3Bucket
  let root: string
  let backed: BackedWorkspace
  const scope: FileScope = { organization: 'acme', project: 'slot-1', purpose: 'new-project' }
  const big = noise(6 * 1024 * 1024, 3)

  beforeAll(async () => {
    bucket = createS3Bucket(bucketConfig(basePrefix))
    root = await tempDir('backed')
    backed = createBackedWorkspace({ workspace: createWorkspace({ root }), bucket, prefix: 'materials' })
  })

  afterAll(async () => {
    try {
      await purgeBasePrefix(bucket)
    } finally {
      bucket.close()
      await removeDir(root)
    }
  })

  test('lists a prefix with full keys and relative paths, and removes it past one DeleteObjects batch', async () => {
    const names = Array.from({ length: S3_DELETE_BATCH_SIZE + 105 }, (_, index) => `item-${String(index).padStart(4, '0')}.txt`)
    for (let index = 0; index < names.length; index += 50) {
      await Promise.all(names.slice(index, index + 50).map(async name => {
        await transferHelper.copy(createBufferSource(Buffer.from(name), { name }), bucket.sink(`bulk/many/${name}`), { verify: false })
      }))
    }
    await transferHelper.copy(createBufferSource(Buffer.from('kept')), bucket.sink('bulk/manyfold.txt'), { verify: false })

    const listed = await bucket.list('bulk/many')
    expect(listed.length).toBe(names.length)
    expect(listed[0]).toMatchObject({ key: `${basePrefix}/bulk/many/${names[0]}`, path: names[0], size: names[0].length })
    expect(listed.map(item => item.path).sort()).toEqual(names)
    await expect(bucket.list('')).rejects.toBeInstanceOf(PathError)
    expect(() => bucket.removePrefix('../outside')).toThrow('path:traversal')

    expect(await bucket.removePrefix('bulk/many')).toBe(names.length)
    expect(await bucket.list('bulk/many')).toEqual([])
    expect((await bucket.list('bulk')).map(item => item.path)).toEqual(['manyfold.txt'])
    expect(await bucket.removePrefix('bulk/many')).toBe(0)
  }, 180_000)

  test('puts files locally and remotely; evict then restore brings them back byte-identical', async () => {
    const files = backed.scope(scope)
    expect(files.key('brand/logo.png')).toBe(`${basePrefix}/materials/acme/slot-1/new-project/brand/logo.png`)
    expect(files.prefixOf('brand/logo.png')).toBe('materials/acme/slot-1/new-project/brand/logo.png')

    const logo = await files.put('brand/logo.png', createBufferSource(PNG, { name: 'logo.png' }), { verify: { allow: [FileKind.Image] }, hash: 'sha256' })
    expect(logo.local).toMatchObject({ kind: 'file', location: join(files.local.dir, 'brand/logo.png'), bytes: PNG.length })
    expect(logo.remote).toMatchObject({ kind: 's3', location: `s3://${bucket.model.bucket}/${files.key('brand/logo.png')}`, bytes: PNG.length, mime: 'image/png' })
    expect(logo.transfer.verdict?.detected?.kind).toBe(FileKind.Image)
    expect(logo.transfer.sha256).toHaveLength(64)
    await files.put('docs/brief.md', createBufferSource(MARKDOWN, { name: 'brief.md' }))
    await files.put('media/clip.bin', createBufferSource(big, { name: 'clip.bin' }), { verify: false })

    expect((await files.list()).map(item => [item.path, item.size])).toEqual([
      ['brand/logo.png', PNG.length], ['docs/brief.md', MARKDOWN.length], ['media/clip.bin', big.length],
    ])
    expect((await bucket.head(files.prefixOf('brand/logo.png')))?.mime).toBe('image/png')

    await files.evict()
    expect(await exists(files.local.dir)).toBe(false)
    expect(await files.restore()).toEqual({ restored: ['brand/logo.png', 'docs/brief.md', 'media/clip.bin'], kept: [] })
    expect(await readFile(join(files.local.dir, 'brand/logo.png'))).toEqual(PNG)
    expect((await readFile(join(files.local.dir, 'media/clip.bin'))).equals(big)).toBe(true)
    expect(await files.restore()).toEqual({ restored: [], kept: ['brand/logo.png', 'docs/brief.md', 'media/clip.bin'] })
  }, 120_000)

  test('downloads a size-changed file again, and a refused put leaves nothing on either side', async () => {
    const files = backed.scope(scope)
    await writeFile(join(files.local.dir, 'docs/brief.md'), 'tampered, and longer than the original brief')
    expect((await files.restore()).restored).toEqual(['docs/brief.md'])
    expect(await readFile(join(files.local.dir, 'docs/brief.md'))).toEqual(MARKDOWN)

    await expect(files.put('brand/fake.png', createBufferSource(ELF, { name: 'fake.png' }))).rejects.toBeInstanceOf(FileMimicryError)
    expect(await files.local.has('brand/fake.png')).toBe(false)
    expect(await bucket.head(files.prefixOf('brand/fake.png'))).toBeNull()
    expect(() => files.prefixOf('../../escape.png')).toThrow('path:traversal')
  }, 60_000)

  test('removes a file on both sides and drops the whole scope prefix', async () => {
    const files = backed.scope(scope)
    const other = backed.scope({ organization: 'acme', project: 'slot-2', purpose: 'new-project' })
    await other.put('keep.txt', createBufferSource(Buffer.from('keep'), { name: 'keep.txt' }))

    await files.remove('docs/brief.md')
    expect(await files.local.has('docs/brief.md')).toBe(false)
    expect(await bucket.head(files.prefixOf('docs/brief.md'))).toBeNull()
    expect((await files.list()).map(item => item.path)).toEqual(['brand/logo.png', 'media/clip.bin'])

    await files.drop()
    expect(await files.list()).toEqual([])
    expect(await exists(files.local.dir)).toBe(false)
    expect(await files.restore()).toEqual({ restored: [], kept: [] })
    expect((await other.list()).map(item => item.path)).toEqual(['keep.txt'])
    expect(await other.local.has('keep.txt')).toBe(true)
  }, 60_000)

  test('the service hands out the configured workspace and backed workspaces of a storage entry', async () => {
    const serviceRoot = await tempDir('backed-service')
    try {
      // A server context reads a string leaf starting with `/` as a secret file: the root is relative to the tmp folder.
      const { files } = await boot({
        storageBuckets: { projects: bucketConfig(basePrefix) }, fileStreams: { workspace: { root: relative(tmpdir(), serviceRoot) } },
      })
      expect(files.workspace().root).toBe(serviceRoot)
      const projects = files.backed('projects', { prefix: 'service' })
      expect(files.backed('projects', { prefix: 'service' })).toBe(projects)
      expect(projects.workspace).toBe(files.workspace())

      const upload = projects.scope({ organization: 'acme', purpose: 'upload' })
      await upload.put('dot.png', createBufferSource(PNG, { name: 'dot.png' }))
      expect(upload.key('dot.png')).toBe(`${basePrefix}/service/acme/upload/dot.png`)
      await upload.evict()
      expect((await upload.restore()).restored).toEqual(['dot.png'])
      expect(await streamUtils.collect((await upload.local.source('dot.png').open()).stream, 10_000)).toEqual(PNG)
      await upload.drop()
      expect(await files.workspace().scopes()).toEqual([])
    } finally {
      await removeDir(serviceRoot)
    }
  }, 60_000)
})
