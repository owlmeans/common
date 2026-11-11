import { lstat, readdir, rmdir } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import type { WorkspaceFs } from './types.local.js'

export const createWorkspaceFs = (): WorkspaceFs => {
  const absent = (error: unknown): boolean => ['ENOENT', 'ENOTDIR'].includes((error as NodeJS.ErrnoException).code ?? '')

  const isFile = async (path: string): Promise<boolean> => {
    try {
      return (await lstat(path)).isFile()
    } catch (error) {
      if (absent(error)) {
        return false
      }
      throw error
    }
  }

  const dirs = async (path: string): Promise<string[]> => {
    try {
      return (await readdir(path, { withFileTypes: true })).filter(item => item.isDirectory()).map(item => item.name)
    } catch (error) {
      if (absent(error)) {
        return []
      }
      throw error
    }
  }

  const removeEmptyParents = async (from: string, root: string): Promise<void> => {
    const base = resolve(root)
    let current = resolve(from)
    while (current !== base && !relative(base, current).startsWith('..')) {
      try {
        await rmdir(current)
      } catch (error) {
        if (!absent(error)) {
          return
        }
      }
      current = dirname(current)
    }
  }

  return { isFile, dirs, removeEmptyParents }
}

export const workspaceFs = createWorkspaceFs()
