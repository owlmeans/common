import { lstat } from 'node:fs/promises'
import { isAbsolute, relative as relativeOf, resolve, sep } from 'node:path'
import { PathError } from '../errors.js'
import { DEFAULT_PATH_LIMITS } from './paths/consts.js'
import type { PathLimits, PathUtils } from './paths/types.js'

export const createPathUtils = (): PathUtils => {
  const forbidden = /[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/

  const entry = (raw: string, limits: Partial<PathLimits> = {}): string => {
    const { maxPathBytes, maxPathSegments } = { ...DEFAULT_PATH_LIMITS, ...limits }
    const path = raw.normalize('NFC').replace(/\\/g, '/')
    if (forbidden.test(path)) {
      throw new PathError('invalid-char')
    }
    if (path.startsWith('/') || /^[A-Za-z]:/.test(path)) {
      throw new PathError('absolute')
    }
    const segments = path.split('/').filter(segment => segment !== '' && segment !== '.')
    if (segments.includes('..')) {
      throw new PathError('traversal')
    }
    if (segments.length === 0) {
      throw new PathError('empty')
    }
    const normalized = segments.join('/')
    if (Buffer.byteLength(normalized) > maxPathBytes) {
      throw new PathError('too-long')
    }
    if (segments.length > maxPathSegments) {
      throw new PathError('too-deep')
    }

    return normalized
  }

  const join = (root: string, relative: string): string => {
    const base = resolve(root)
    const target = resolve(base, relative)
    const inside = relativeOf(base, target)
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) {
      throw new PathError('traversal')
    }

    return target
  }

  const assertNoLinks = async (root: string, target: string): Promise<void> => {
    const base = resolve(root)
    const parts = relativeOf(base, resolve(target)).split(sep).filter(part => part !== '')
    let current = base
    for (const part of parts) {
      current = `${current}${sep}${part}`
      try {
        if ((await lstat(current)).isSymbolicLink()) {
          throw new PathError('symlink')
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          return
        }
        throw error
      }
    }
  }

  const key = (prefix: string, relative: string): string => {
    const clean = prefix.replace(/\/+$/, '')
    return clean === '' ? entry(relative) : `${clean}/${entry(relative)}`
  }

  return { entry, join, assertNoLinks, key }
}

export const pathUtils = createPathUtils()
