import { lstat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { logger } from '@owlmeans/log'
import { FileScopeError, fileScopeHelper } from '@owlmeans/storage-common'
import type { FileScope } from '@owlmeans/storage-common'
import {
  DEFAULT_WORKSPACE_DIR, DEFAULT_WORKSPACE_DIR_MODE, DEFAULT_WORKSPACE_FILE_MODE, WORKSPACE_SCOPE_MARKER,
} from './workspace/consts.js'
import { workspaceFs } from './workspace/fs.js'
import { makeWorkspaceScope } from './workspace/scope.js'
import type { Workspace, WorkspaceOptions, WorkspacePruneOptions, WorkspaceScope } from './workspace/types.js'
import type { WorkspaceCore } from './workspace/types.local.js'

const log = logger('file-streams:workspace')

/**
 * Temporary files of a service, nested by {@link FileScope}: `<root>/<organization>/<project?>/<purpose>`.
 * Nothing here survives a pod restart — a backed workspace restores a scope from its bucket.
 */
export const createWorkspace = (options: WorkspaceOptions = {}): Workspace => {
  const core: WorkspaceCore = {
    // A relative root lives under the temporary folder (which TMPDIR moves), never under the cwd.
    root: resolve(tmpdir(), options.root ?? DEFAULT_WORKSPACE_DIR),
    dirMode: options.dirMode ?? DEFAULT_WORKSPACE_DIR_MODE,
    fileMode: options.fileMode ?? DEFAULT_WORKSPACE_FILE_MODE,
  }

  const scope = (value: FileScope): WorkspaceScope => makeWorkspaceScope(core, value)

  const isMarked = async (...segments: string[]): Promise<boolean> =>
    await workspaceFs.isFile(join(core.root, ...segments, WORKSPACE_SCOPE_MARKER))

  const segmentsIn = async (...segments: string[]): Promise<string[]> =>
    (await workspaceFs.dirs(join(core.root, ...segments))).filter(fileScopeHelper.isSegment)

  const scopes = async (organization?: string): Promise<FileScope[]> => {
    let organizations: string[]
    if (organization != null) {
      if (!fileScopeHelper.isSegment(organization)) {
        throw new FileScopeError('organization')
      }
      organizations = (await segmentsIn()).includes(organization) ? [organization] : []
    } else {
      organizations = await segmentsIn()
    }
    const found: FileScope[] = []
    for (const org of organizations) {
      for (const second of await segmentsIn(org)) {
        if (await isMarked(org, second)) {
          found.push({ organization: org, purpose: second })
        }
        for (const third of await segmentsIn(org, second)) {
          if (await isMarked(org, second, third)) {
            found.push({ organization: org, project: second, purpose: third })
          }
        }
      }
    }

    return found
      .map(value => ({ value, path: fileScopeHelper.pathOf(value) }))
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0)
      .map(({ value }) => value)
  }

  const lastTouched = async (local: WorkspaceScope): Promise<number> => {
    let latest = 0
    for (const path of [local.dir, join(local.dir, WORKSPACE_SCOPE_MARKER)]) {
      try {
        latest = Math.max(latest, (await lstat(path)).mtimeMs)
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          throw error
        }
      }
    }
    for (const file of await local.list()) {
      latest = Math.max(latest, file.modifiedAt.getTime())
    }
    return latest
  }

  const prune = async ({ olderThanMs }: WorkspacePruneOptions): Promise<number> => {
    const threshold = Date.now() - olderThanMs
    let dropped = 0
    for (const found of await scopes()) {
      const local = scope(found)
      if (await lastTouched(local) < threshold) {
        await local.drop()
        dropped++
      }
    }
    if (dropped > 0) {
      log.info('Stale workspace scopes dropped', { dropped })
    }

    return dropped
  }

  return { root: core.root, scope, scopes, prune }
}
