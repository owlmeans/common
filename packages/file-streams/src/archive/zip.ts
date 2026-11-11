import { Readable } from 'node:stream'
import yauzl from 'yauzl'
import type { Entry, ZipFile } from 'yauzl'
import yazl from 'yazl'
import { ArchiveError, LimitError, PathError } from '../errors.js'
import type { RangeReader } from '../types.js'
import { pathUtils } from '../utils/paths.js'
import { rangeUtils } from '../utils/range.js'
import { RATIO_FLOOR_BYTES, ZIP_LOCAL_HEADER_BYTES } from './consts.js'
import type { ArchiveEntryInfo, ArchiveLimits, ArchivePackOptions, PackEntry } from './types.js'
import type { ArchiveEntryHandle, ZipCodec } from './types.local.js'

/** Zip read from its central directory (yauzl, random access) and written as a stream (yazl). */
export const createZipCodec = (): ZipCodec => {
  const mapError = (error: unknown): Error => {
    const message = (error as Error).message ?? ''
    if (/absolute path/i.test(message)) {
      return new PathError('absolute')
    }
    if (/invalid relative path|\.\./i.test(message)) {
      return new PathError('traversal')
    }
    if (/invalid characters/i.test(message)) {
      return new PathError('invalid-char')
    }
    return error instanceof Error && error.name !== 'Error' ? error : new ArchiveError('corrupt')
  }

  const readAll = (zipfile: ZipFile, limits: ArchiveLimits): Promise<Entry[]> => new Promise((resolve, reject) => {
    const all: Entry[] = []
    zipfile.on('entry', (entry: Entry) => {
      all.push(entry)
      if (all.length > limits.maxEntries) {
        zipfile.removeAllListeners()
        reject(new LimitError('entries'))
        return
      }
      zipfile.readEntry()
    })
    zipfile.once('end', () => resolve(all))
    zipfile.once('error', error => reject(mapError(error)))
    zipfile.readEntry()
  })

  const infoOf = (entry: Entry): ArchiveEntryInfo => {
    const mode = (entry.externalFileAttributes >>> 16) & 0xffff
    const directory = entry.fileName.endsWith('/')
    const symlink = (mode & 0o170000) === 0o120000
    return {
      path: entry.fileName,
      type: directory ? 'directory' : symlink ? 'symlink' : 'file',
      size: entry.uncompressedSize,
      compressedSize: entry.compressedSize,
      mode: mode !== 0 ? mode & 0o7777 : undefined,
      modifiedAt: entry.getLastModDate(),
      encrypted: entry.isEncrypted(),
    }
  }

  const audit = (all: Entry[], limits: ArchiveLimits): void => {
    let declared = 0
    for (const entry of all) {
      declared += entry.uncompressedSize
      if (entry.uncompressedSize > RATIO_FLOOR_BYTES && entry.uncompressedSize > entry.compressedSize * limits.maxRatio) {
        throw new LimitError('ratio')
      }
    }
    if (declared > limits.maxTotalBytes) {
      throw new LimitError('total-bytes')
    }
    const ordered = [...all].sort((a, b) => a.relativeOffsetOfLocalHeader - b.relativeOffsetOfLocalHeader)
    for (let index = 1; index < ordered.length; index++) {
      const previous = ordered[index - 1]
      const end = previous.relativeOffsetOfLocalHeader + ZIP_LOCAL_HEADER_BYTES + previous.fileNameLength + previous.compressedSize
      if (ordered[index].relativeOffsetOfLocalHeader < end) {
        throw new ArchiveError('overlap')
      }
    }
  }

  const entries = async function * (reader: RangeReader, limits: ArchiveLimits): AsyncGenerator<ArchiveEntryHandle> {
    let zipfile: ZipFile
    try {
      zipfile = await yauzl.fromRandomAccessReaderPromise(rangeUtils.zipReader(reader), reader.size, {
        lazyEntries: true, validateEntrySizes: true, strictFileNames: false, decodeStrings: true, autoClose: false,
      })
    } catch (error) {
      throw mapError(error)
    }
    try {
      const all = await readAll(zipfile, limits)
      audit(all, limits)
      for (const entry of all) {
        yield {
          info: infoOf(entry),
          open: async () => {
            if (entry.compressionMethod !== 0 && entry.compressionMethod !== 8) {
              throw new ArchiveError(`method:${entry.compressionMethod}`)
            }
            try {
              return await zipfile.openReadStreamPromise(entry)
            } catch (error) {
              throw mapError(error)
            }
          },
          drain: async () => undefined,
        }
      }
    } finally {
      zipfile.close()
    }
  }

  const pack = (list: Iterable<PackEntry> | AsyncIterable<PackEntry>, options: ArchivePackOptions): Readable => {
    const zip = new yazl.ZipFile()
    const output = zip.outputStream as Readable
    const add = async (): Promise<void> => {
      for await (const entry of list) {
        const path = pathUtils.entry(entry.path)
        const metadata = {
          mtime: entry.modifiedAt ?? new Date(),
          mode: 0o100000 | ((entry.mode ?? 0o644) & 0o777),
          ...(options.level != null ? { compressionLevel: options.level } : {}),
        }
        const source = entry.source
        if (source instanceof Uint8Array) {
          zip.addBuffer(Buffer.from(source), path, metadata)
        } else {
          zip.addReadStreamLazy(path, metadata, callback => {
            source.open().then(opened => callback(null, opened.stream), error => callback(error, Readable.from([])))
          })
        }
      }
      zip.end()
    }
    add().catch(error => output.destroy(error as Error))

    return output
  }

  return { entries, pack }
}
