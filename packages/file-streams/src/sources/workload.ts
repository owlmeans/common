import { Readable } from 'node:stream'
import { logger } from '@owlmeans/log'
import { WorkloadError } from '../errors.js'
import { WORKLOAD_MAX_FILE_BYTES } from '../sinks/workload/consts.js'
import type { FileInfo, FileSource, OpenedFile, OpenOptions, RangeReader, SignalOptions } from '../types.js'
import { nameUtils } from '../utils/names.js'
import { pathUtils } from '../utils/paths.js'
import { rangeUtils } from '../utils/range.js'
import type { SourceClaims } from './types.js'
import type { WorkloadReader, WorkloadSource, WorkloadSourceOptions } from './workload/types.js'

const log = logger('file-streams:workload')

/**
 * Files read from a Viable ephemeral workload through its reader — the read twin of
 * `makeWorkloadSink`: one read per open, each file at most 12 MiB or a lower `maxFileBytes`.
 */
export const makeWorkloadSource = (reader: WorkloadReader, options: WorkloadSourceOptions = {}): WorkloadSource => {
  const ceiling = Math.min(options.maxFileBytes ?? WORKLOAD_MAX_FILE_BYTES, WORKLOAD_MAX_FILE_BYTES)
  const root = options.root != null && options.root.replace(/^\/+|\/+$/g, '') !== '' ? pathUtils.entry(options.root) : ''
  const retries = options.retries ?? 1

  const entry = (path: string, claims: SourceClaims = {}): FileSource => {
    const filePath = root === '' ? pathUtils.entry(path) : `${root}/${pathUtils.entry(path)}`
    let known: FileInfo = { origin: filePath, name: nameUtils.sanitize(claims.name ?? filePath.split('/').at(-1)), mime: claims.mime }

    const read = async (signal?: AbortSignal): Promise<Buffer> => {
      let base64: unknown
      for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted()
        try {
          base64 = await reader.readBinaryFile(filePath)
          break
        } catch {
          if (attempt >= retries) {
            log.warn('Workload read failed', { attempts: attempt + 1 })
            throw new WorkloadError('read-failed')
          }
        }
      }
      signal?.throwIfAborted()
      if (typeof base64 !== 'string') {
        throw new WorkloadError('read-failed')
      }
      // Four characters carry three bytes: refuse an oversized payload before decoding it.
      if (base64.length > Math.ceil(ceiling / 3) * 4) {
        throw new WorkloadError('too-large')
      }
      const bytes = Buffer.from(base64, 'base64')
      if (bytes.length > ceiling) {
        throw new WorkloadError('too-large')
      }
      known = { ...known, size: bytes.length }

      return bytes
    }

    // No read of its own: the size is known once a read has happened.
    const info = async (): Promise<FileInfo> => known

    const open = async (openOptions: OpenOptions = {}): Promise<OpenedFile> => {
      const bytes = await read(openOptions.signal)
      if (openOptions.range == null) {
        return { stream: Readable.from(bytes.length > 0 ? [bytes] : [], { objectMode: false }), info: known }
      }
      const start = Math.min(openOptions.range.start, bytes.length)
      const end = Math.min(openOptions.range.end ?? bytes.length - 1, bytes.length - 1)
      const slice = bytes.subarray(start, end + 1)

      return { stream: Readable.from(slice.length > 0 ? [slice] : [], { objectMode: false }), info: known, range: { start, end, total: bytes.length } }
    }

    const ranges = async (rangeOptions: SignalOptions = {}): Promise<RangeReader> => rangeUtils.ofBuffer(await read(rangeOptions.signal))

    return { kind: 'workload', info, open, ranges }
  }

  return { kind: 'workload', entry }
}
