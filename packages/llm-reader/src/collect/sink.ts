import { randomUUID } from 'node:crypto'
import { mkdir, open, realpath, rename, rm } from 'node:fs/promises'
import { dirname, join, resolve, sep } from 'node:path'
import { ReaderRefusedError } from '../errors.js'
import { collectPaths } from './paths.js'
import type { CollectSink } from './types.js'

/**
 * Collected files into a directory: each written to a temporary name beside its target and renamed
 * into place once complete (a stream that errors leaves nothing), confined to the root — a path that
 * could leave it, or a directory under it that is a link pointing out, is refused.
 */
export const createDirectoryCollectSink = (root: string): CollectSink => {
  const base = resolve(root)

  const write: CollectSink['write'] = async (path, stream) => {
    const safe = collectPaths.safe(path)
    if (safe == null) throw new ReaderRefusedError(`sink-path:${path}`)
    const target = join(base, ...safe.split('/'))
    await mkdir(dirname(target), { recursive: true })
    const [realBase, realDir] = await Promise.all([realpath(base), realpath(dirname(target))])
    if (realDir !== realBase && !realDir.startsWith(`${realBase}${sep}`)) throw new ReaderRefusedError(`sink-escape:${path}`)
    const temporary = `${target}.${randomUUID()}.part`
    const handle = await open(temporary, 'wx', 0o644)
    let bytes = 0
    try {
      for await (const chunk of stream as unknown as AsyncIterable<Uint8Array>) {
        await handle.write(chunk)
        bytes += chunk.byteLength
      }
      await handle.close()
      await rename(temporary, target)
    } catch (e) {
      await handle.close().catch(() => undefined)
      await rm(temporary, { force: true })
      throw e
    }
    return { bytes }
  }

  return { write }
}
