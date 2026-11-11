import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { mkdir, readFile, stat, symlink, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import {
  archiveHelper, createBufferSource, createWorkspace, FileKind, FileScopeError, PathError, transferHelper, WORKSPACE_SCOPE_MARKER,
} from '../src/index.js'
import type { FileScope, Workspace, WorkspaceScope } from '../src/index.js'
import { streamUtils } from '../src/utils/streams.js'
import { PNG, tgzOf } from './fixtures.js'
import { removeDir, tempDir } from './context.js'

const write = async (local: WorkspaceScope, path: string, data: string | Buffer): Promise<void> => {
  await local.entry(path).write({ stream: Readable.from([Buffer.from(data)]), info: { origin: 'test' } })
}

const exists = async (path: string): Promise<boolean> => await stat(path).then(() => true, () => false)

describe('@owlmeans/file-streams — workspace', () => {
  let root: string
  let workspace: Workspace
  const project: FileScope = { organization: 'acme', project: 'slot-1', purpose: 'new-project' }
  const upload: FileScope = { organization: 'acme', purpose: 'upload' }

  beforeEach(async () => {
    root = await tempDir('workspace')
    workspace = createWorkspace({ root })
  })
  afterEach(async () => { await removeDir(root) })

  test('nests scope folders by organization, project and purpose, and finds them again', async () => {
    expect(createWorkspace().root).toBe(join(tmpdir(), 'owlmeans-workspace'))
    expect(createWorkspace({ root: 'service/files' }).root).toBe(join(tmpdir(), 'service/files'))
    const local = workspace.scope(project)
    expect(local.dir).toBe(join(root, 'acme/slot-1/new-project'))
    expect(workspace.scope(upload).dir).toBe(join(root, 'acme/upload'))
    expect(await local.list()).toEqual([])

    const copied = await transferHelper.copy(createBufferSource(PNG, { name: 'logo.png' }), local.entry('brand/logo.png'), {
      verify: { allow: [FileKind.Image] },
    })
    expect(copied.sink).toMatchObject({ kind: 'file', location: join(local.dir, 'brand/logo.png'), bytes: PNG.length })
    const archive = await tgzOf([{ name: 'kit/a.txt', data: 'a' }, { name: 'kit/deep/b.txt', data: 'bb' }])
    await archiveHelper.extract(createBufferSource(archive, { name: 'kit.tar.gz' }), local.tree())
    await write(workspace.scope(upload), 'note.md', '# note')

    expect((await local.list()).map(file => [file.path, file.size])).toEqual([['brand/logo.png', PNG.length], ['kit/a.txt', 1], ['kit/deep/b.txt', 2]])
    expect((await local.list())[0].modifiedAt).toBeInstanceOf(Date)
    expect(await local.has('kit/deep/b.txt')).toBe(true)
    expect(await local.has('kit/deep')).toBe(false)
    expect(await streamUtils.collect((await local.source('brand/logo.png').open()).stream, 10_000)).toEqual(PNG)
    expect(await exists(join(local.dir, WORKSPACE_SCOPE_MARKER))).toBe(true)

    expect(await workspace.scopes()).toEqual([project, upload])
    expect(await workspace.scopes('acme')).toEqual([project, upload])
    expect(await workspace.scopes('other')).toEqual([])
    expect(() => workspace.scope({ organization: '..', purpose: 'x' })).toThrow(FileScopeError)
    await expect(workspace.scopes('../etc')).rejects.toThrow('stored-file:scope:organization')
  })

  test('confines every path: traversal, absolute paths, the marker name and symlinks are refused', async () => {
    const local = workspace.scope(project)
    await write(local, 'inside.txt', 'in')
    expect(() => local.entry('../escape.txt')).toThrow('path:traversal')
    expect(() => local.entry('/etc/passwd')).toThrow('path:absolute')
    expect(() => local.source('a/../../b')).toThrow(PathError)
    expect(() => local.entry(WORKSPACE_SCOPE_MARKER)).toThrow('path:reserved')
    expect(() => local.entry(`media/${WORKSPACE_SCOPE_MARKER}`)).toThrow('path:reserved')

    const outside = await tempDir('outside')
    try {
      await writeFile(join(outside, 'secret.txt'), 'secret')
      await symlink(outside, join(local.dir, 'linked'))
      await symlink(join(outside, 'secret.txt'), join(local.dir, 'secret.txt'))
      await expect(write(local, 'linked/planted.txt', 'x')).rejects.toThrow('path:symlink')
      expect(await exists(join(outside, 'planted.txt'))).toBe(false)
      await expect(local.source('secret.txt').open()).rejects.toThrow('path:symlink')
      await expect(local.has('linked/secret.txt')).rejects.toThrow('path:symlink')
      await expect(local.remove('linked/secret.txt')).rejects.toThrow('path:symlink')
      expect((await local.list()).map(file => file.path)).toEqual(['inside.txt'])

      await mkdir(join(root, 'evil'))
      await symlink(outside, join(root, 'evil/slot-2'))
      await expect(write(workspace.scope({ organization: 'evil', project: 'slot-2', purpose: 'p' }), 'a.txt', 'a')).rejects.toThrow('path:symlink')
      expect(await exists(join(outside, 'p'))).toBe(false)
    } finally {
      await removeDir(outside)
    }
  })

  test('removes files and folders, drops a scope with the parents it empties, and keeps scopes from overlapping', async () => {
    const local = workspace.scope(project)
    await write(local, 'a/b/c.txt', 'c')
    await write(local, 'd.txt', 'd')
    await expect(write(local, 'd.txt', 'again')).rejects.toThrow('path:exists')
    await local.tree({ onConflict: 'overwrite' }).entry('d.txt').write({ stream: Readable.from([Buffer.from('dd')]), info: { origin: 'test' } })
    expect(await readFile(join(local.dir, 'd.txt'), 'utf8')).toBe('dd')

    expect(await local.remove('a/b/c.txt')).toBe(true)
    expect(await exists(join(local.dir, 'a'))).toBe(false)
    expect(await local.remove('a/b/c.txt')).toBe(false)
    expect((await local.list()).map(file => file.path)).toEqual(['d.txt'])

    const sibling = workspace.scope({ organization: 'acme', project: 'slot-1', purpose: 'other' })
    await write(sibling, 'x.txt', 'x')
    await local.drop()
    expect(await exists(local.dir)).toBe(false)
    expect(await exists(join(root, 'acme/slot-1'))).toBe(true)
    await sibling.drop()
    expect(await exists(join(root, 'acme'))).toBe(false)
    expect(await exists(root)).toBe(true)
    await sibling.drop()

    // `acme/slot-1` cannot be both a purpose and a project folder.
    await write(local, 'mine.txt', 'mine')
    await expect(write(workspace.scope({ organization: 'acme', purpose: 'slot-1' }), 'x.txt', 'x')).rejects.toThrow('path:scope-overlap')
    await local.drop()
    await write(workspace.scope({ organization: 'acme', purpose: 'slot-1' }), 'x.txt', 'x')
    await expect(write(local, 'mine.txt', 'mine')).rejects.toThrow('path:scope-overlap')
  })

  test('prunes the scopes untouched for longer than the threshold', async () => {
    const stale = workspace.scope(project)
    const fresh = workspace.scope(upload)
    await write(stale, 'old/a.txt', 'a')
    await write(fresh, 'b.txt', 'b')
    const past = new Date(Date.now() - 2 * 3600_000)
    for (const path of ['old/a.txt', 'old', WORKSPACE_SCOPE_MARKER, '']) {
      await utimes(join(stale.dir, path), past, past)
    }

    expect(await workspace.prune({ olderThanMs: 3 * 3600_000 })).toBe(0)
    expect(await workspace.prune({ olderThanMs: 3600_000 })).toBe(1)
    expect(await workspace.scopes()).toEqual([upload])
    expect(await exists(join(root, 'acme/slot-1'))).toBe(false)
    expect((await fresh.list()).map(file => file.path)).toEqual(['b.txt'])
  })

  test('writes to two scopes concurrently while a third scope of the organization is dropped', async () => {
    const first = workspace.scope(project)
    const second = workspace.scope(upload)
    const third = workspace.scope({ organization: 'acme', purpose: 'scratch' })
    await write(third, 'tmp.txt', 'tmp')

    const names = Array.from({ length: 20 }, (_, index) => `part-${String(index).padStart(2, '0')}.txt`)
    await Promise.all([
      ...names.map(async name => { await write(first, `batch/${name}`, `first ${name}`) }),
      ...names.map(async name => { await write(second, name, `second ${name}`) }),
      third.drop(),
    ])

    expect((await first.list()).map(file => file.path)).toEqual(names.map(name => `batch/${name}`))
    expect((await second.list()).map(file => file.path)).toEqual(names)
    expect(await readFile(join(second.dir, names[7]), 'utf8')).toBe(`second ${names[7]}`)
    expect(await workspace.scopes()).toEqual([project, upload])
  })
})
