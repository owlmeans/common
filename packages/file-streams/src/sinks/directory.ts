import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { PathError } from '../errors.js'
import type { FileSink, SignalOptions, TreeSink } from '../types.js'
import { pathUtils } from '../utils/paths.js'
import { createFileSink } from './file.js'
import type { DirectorySinkOptions } from './directory/types.js'

/**
 * A directory every entry is confined to: normalized relative paths only, never through an
 * existing symlink, never the same entry (or a case-fold twin) twice.
 */
export const createDirectorySink = (root: string, options: DirectorySinkOptions = {}): TreeSink => {
  const base = resolve(root)
  const seen = new Set<string>()

  const entry = (path: string): FileSink => {
    const relative = pathUtils.entry(path, options)
    const target = pathUtils.join(base, relative)
    const folded = relative.toLowerCase()
    if (seen.has(folded)) {
      throw new PathError('duplicate')
    }
    const sink = createFileSink(target, options)

    return {
      kind: 'file',
      write: async (input, writeOptions) => {
        if (seen.has(folded)) {
          throw new PathError('duplicate')
        }
        await mkdir(base, { recursive: true, mode: options.dirMode ?? 0o755 })
        await pathUtils.assertNoLinks(base, target)
        const result = await sink.write(input, writeOptions)
        seen.add(folded)
        return result
      },
    }
  }

  const directory = async (path: string, _options?: SignalOptions): Promise<void> => {
    const target = pathUtils.join(base, pathUtils.entry(path, options))
    await mkdir(base, { recursive: true, mode: options.dirMode ?? 0o755 })
    await pathUtils.assertNoLinks(base, target)
    await mkdir(target, { recursive: true, mode: options.dirMode ?? 0o755 })
  }

  return { kind: 'directory', entry, directory }
}
