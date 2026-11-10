import { Readable } from 'node:stream'
import type { FileInfo, FileSource, OpenedFile, OpenOptions, RangeReader } from '../types.js'
import { nameUtils } from '../utils/names.js'
import { rangeUtils } from '../utils/range.js'
import type { SourceClaims } from './types.js'

/** Bytes in memory — a screenshot, a generated file: re-openable, with random access. */
export const createBufferSource = (bytes: Uint8Array, claims: SourceClaims = {}): FileSource => {
  const known: FileInfo = { origin: 'buffer', name: nameUtils.sanitize(claims.name), size: bytes.length, mime: claims.mime }

  const info = async (): Promise<FileInfo> => known

  const open = async (options: OpenOptions = {}): Promise<OpenedFile> => {
    if (options.range == null) {
      return { stream: Readable.from([Buffer.from(bytes)], { objectMode: false }), info: known }
    }
    const start = Math.min(options.range.start, bytes.length)
    const end = Math.min(options.range.end ?? bytes.length - 1, bytes.length - 1)
    const slice = Buffer.from(bytes.subarray(start, end + 1))

    return { stream: Readable.from(slice.length > 0 ? [slice] : [], { objectMode: false }), info: known, range: { start, end, total: bytes.length } }
  }

  const ranges = async (): Promise<RangeReader> => rangeUtils.ofBuffer(bytes)

  return { kind: 'buffer', info, open, ranges }
}
