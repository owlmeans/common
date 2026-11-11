import { createReadStream } from 'node:fs'
import { stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { SourceError } from '../errors.js'
import type { FileInfo, FileSource, OpenedFile, OpenOptions, RangeReader } from '../types.js'
import { nameUtils } from '../utils/names.js'
import { rangeUtils } from '../utils/range.js'
import type { SourceClaims } from './types.js'

/** A regular file on disk: re-openable, with random access. */
export const createFileSource = (path: string, claims: SourceClaims = {}): FileSource => {
  let known: FileInfo | undefined

  const info = async (): Promise<FileInfo> => {
    if (known != null) {
      return known
    }
    let stats
    try {
      stats = await stat(path)
    } catch (error) {
      throw (error as NodeJS.ErrnoException).code === 'ENOENT' ? new SourceError('not-found') : error
    }
    if (!stats.isFile()) {
      throw new SourceError('not-a-file')
    }
    known = {
      origin: path,
      name: nameUtils.sanitize(claims.name ?? basename(path)),
      size: stats.size,
      mime: claims.mime,
      etag: `${Math.trunc(stats.mtimeMs)}-${stats.size}`,
      modifiedAt: stats.mtime,
    }

    return known
  }

  const open = async (options: OpenOptions = {}): Promise<OpenedFile> => {
    const current = await info()
    const size = current.size ?? 0
    if (options.range == null) {
      return { stream: createReadStream(path, { signal: options.signal }), info: current }
    }
    const start = Math.min(options.range.start, size)
    const end = Math.min(options.range.end ?? size - 1, size - 1)
    const stream = end < start
      ? createReadStream(path, { start: 0, end: -1, signal: options.signal })
      : createReadStream(path, { start, end, signal: options.signal })

    return { stream, info: current, range: { start, end, total: size } }
  }

  const ranges = async (): Promise<RangeReader> => rangeUtils.ofFile(path, (await info()).size ?? 0)

  return { kind: 'file', info, open, ranges }
}
