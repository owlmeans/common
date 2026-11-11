import { lstat, mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileScopeHelper } from '@owlmeans/storage-common'
import type { FileScope } from '@owlmeans/storage-common'
import { PathError } from '../errors.js'
import { createDirectorySink } from '../sinks/directory.js'
import { createFileSource } from '../sources/file.js'
import type { SourceClaims } from '../sources/types.js'
import type { FileSink, FileSource, SinkInput, TreeSink } from '../types.js'
import { pathUtils } from '../utils/paths.js'
import { streamUtils } from '../utils/streams.js'
import { IN_FLIGHT_FILE } from './consts.local.js'
import { WORKSPACE_SCOPE_MARKER } from './consts.js'
import { workspaceFs } from './fs.js'
import type { WorkspaceFile, WorkspaceScope, WorkspaceWriteOptions } from './types.js'
import type { WorkspaceCore, WorkspaceTarget } from './types.local.js'

/** The folder of one scope; the marker file is written with its first write. */
export const makeWorkspaceScope = (core: WorkspaceCore, scope: FileScope): WorkspaceScope => {
  const dir = join(core.root, fileScopeHelper.pathOf(scope))
  const marker = join(dir, WORKSPACE_SCOPE_MARKER)
  const frozen: FileScope = Object.freeze({ ...scope })

  const target = (path: string): WorkspaceTarget => {
    const relative = pathUtils.entry(path)
    if (relative.split('/').includes(WORKSPACE_SCOPE_MARKER)) {
      throw new PathError('reserved')
    }
    return { relative, absolute: pathUtils.join(dir, relative) }
  }

  // `<organization>/<purpose>` would contain `<organization>/<project>/…` when a project segment
  // equals a purpose; whichever scope is on disk first keeps the folder.
  const assertNoOverlap = async (): Promise<void> => {
    const parent = dirname(dir)
    if (scope.project != null && await workspaceFs.isFile(join(parent, WORKSPACE_SCOPE_MARKER))) {
      throw new PathError('scope-overlap')
    }
    if (scope.project == null) {
      for (const child of await workspaceFs.dirs(dir)) {
        if (await workspaceFs.isFile(join(dir, child, WORKSPACE_SCOPE_MARKER))) {
          throw new PathError('scope-overlap')
        }
      }
    }
  }

  const ensure = async (): Promise<void> => {
    await pathUtils.assertNoLinks(core.root, dir)
    if (await workspaceFs.isFile(marker)) {
      return
    }
    await assertNoOverlap()
    // A concurrent drop may remove an empty parent between the two calls: retry once.
    for (let attempt = 0; ; attempt++) {
      try {
        await mkdir(dir, { recursive: true, mode: core.dirMode })
        await pathUtils.assertNoLinks(core.root, dir)
        await writeFile(marker, `${JSON.stringify(frozen)}\n`, { flag: 'wx', mode: core.fileMode })
        return
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        if (code === 'EEXIST') {
          return
        }
        if (code !== 'ENOENT' || attempt > 0) {
          throw error
        }
      }
    }
  }

  const prepare = async ({ absolute }: WorkspaceTarget, input?: SinkInput): Promise<void> => {
    try {
      await ensure()
      await pathUtils.assertNoLinks(core.root, absolute)
      await mkdir(dirname(absolute), { recursive: true, mode: core.dirMode })
      await pathUtils.assertNoLinks(core.root, absolute)
    } catch (error) {
      if (input != null) {
        streamUtils.discard(input.stream)
      }
      throw error
    }
  }

  const sinkOver = (tree: TreeSink, path: string): FileSink => {
    const resolved = target(path)
    const sink = tree.entry(resolved.relative)
    return {
      kind: sink.kind,
      write: async (input, writeOptions) => {
        await prepare(resolved, input)
        return await sink.write(input, writeOptions)
      },
    }
  }

  const directoryOf = (options: WorkspaceWriteOptions): TreeSink =>
    createDirectorySink(dir, { onConflict: options.onConflict, dirMode: core.dirMode, mode: core.fileMode })

  const tree = (options: WorkspaceWriteOptions = {}): TreeSink => {
    const inner = directoryOf(options)
    return {
      kind: inner.kind,
      entry: path => sinkOver(inner, path),
      directory: async (path, signalOptions) => {
        const resolved = target(path)
        await prepare(resolved)
        await inner.directory(resolved.relative, signalOptions)
      },
    }
  }

  const entry = (path: string, options: WorkspaceWriteOptions = {}): FileSink => sinkOver(directoryOf(options), path)

  const source = (path: string, claims: SourceClaims = {}): FileSource => {
    const resolved = target(path)
    const file = createFileSource(resolved.absolute, claims)
    const guard = async (): Promise<void> => { await pathUtils.assertNoLinks(core.root, resolved.absolute) }
    return {
      kind: file.kind,
      info: async options => { await guard(); return await file.info(options) },
      open: async options => { await guard(); return await file.open(options) },
      ranges: async options => { await guard(); return await file.ranges(options) },
    }
  }

  const list = async (): Promise<WorkspaceFile[]> => {
    await pathUtils.assertNoLinks(core.root, dir)
    const files: WorkspaceFile[] = []
    const walk = async (absolute: string, relative: string): Promise<void> => {
      let items
      try {
        items = await readdir(absolute, { withFileTypes: true })
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return
        }
        throw error
      }
      for (const item of items) {
        const path = relative === '' ? item.name : `${relative}/${item.name}`
        if (item.name === WORKSPACE_SCOPE_MARKER || item.isSymbolicLink()) {
          continue
        }
        if (item.isDirectory()) {
          await walk(join(absolute, item.name), path)
        } else if (item.isFile() && !IN_FLIGHT_FILE.test(item.name)) {
          try {
            const stats = await lstat(join(absolute, item.name))
            files.push({ path, size: stats.size, modifiedAt: stats.mtime })
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
              throw error
            }
          }
        }
      }
    }
    await walk(dir, '')

    return files.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
  }

  const has = async (path: string): Promise<boolean> => {
    const { absolute } = target(path)
    await pathUtils.assertNoLinks(core.root, absolute)
    return await workspaceFs.isFile(absolute)
  }

  const remove = async (path: string): Promise<boolean> => {
    const { absolute } = target(path)
    await pathUtils.assertNoLinks(core.root, absolute)
    try {
      await lstat(absolute)
    } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')) {
        return false
      }
      throw error
    }
    await rm(absolute, { recursive: true, force: true })
    await workspaceFs.removeEmptyParents(dirname(absolute), dir)

    return true
  }

  const drop = async (): Promise<void> => {
    await pathUtils.assertNoLinks(core.root, dir)
    await rm(dir, { recursive: true, force: true })
    await workspaceFs.removeEmptyParents(dirname(dir), core.root)
  }

  return { scope: frozen, dir, tree, entry, source, list, has, remove, drop }
}
