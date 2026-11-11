import { createReadStream } from 'node:fs'
import { lstat, readdir } from 'node:fs/promises'
import { basename, join, relative, resolve, sep } from 'node:path'
import type { UploadInput } from '../types.js'
import type { UploadPathHelper, UploadPathOptions } from './types.js'

export const createUploadPathHelper = (): UploadPathHelper => {
  const portable = (path: string): string => sep === '/' ? path : path.split(sep).join('/')

  const input = (absolute: string, path: string, size: number): UploadInput => ({
    path: portable(path), size, body: () => createReadStream(absolute),
  })

  const walk = async (folder: string, relativeOf: (absolute: string) => string, into: UploadInput[]): Promise<void> => {
    const entries = (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0)
    for (const entry of entries) {
      const absolute = join(folder, entry.name)
      if (entry.isDirectory()) {
        await walk(absolute, relativeOf, into)
      } else if (entry.isFile()) {
        into.push(input(absolute, relativeOf(absolute), (await lstat(absolute)).size))
      }
    }
  }

  const fromPaths: UploadPathHelper['fromPaths'] = async (paths: string[], options: UploadPathOptions = {}) => {
    const base = options.base != null ? resolve(options.base) : undefined
    const inputs: UploadInput[] = []
    for (const given of paths) {
      const absolute = resolve(given)
      const stats = await lstat(absolute)
      if (stats.isSymbolicLink()) {
        continue
      }
      if (stats.isFile()) {
        inputs.push(input(absolute, base != null ? relative(base, absolute) : basename(absolute), stats.size))
      } else if (stats.isDirectory()) {
        const name = basename(absolute)
        await walk(absolute, file => base != null ? relative(base, file) : join(name, relative(absolute, file)), inputs)
      }
    }

    return inputs
  }

  return { fromPaths }
}

export const uploadPathHelper = createUploadPathHelper()
