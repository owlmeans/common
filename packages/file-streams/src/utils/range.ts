import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { PassThrough, Readable } from 'node:stream'
import yauzl from 'yauzl'
import type { RandomAccessReader as ZipRandomAccessReader } from 'yauzl'
import type { RangeReader } from '../types.js'
import type { RangeUtils } from './range/types.js'

export const createRangeUtils = (): RangeUtils => {
  const zipReader = (reader: RangeReader): ZipRandomAccessReader => {
    const ZipReader = yauzl.RandomAccessReader as unknown as new () => ZipRandomAccessReader
    const adapter = new ZipReader()

    adapter._readStreamForRange = (start: number, end: number): Readable => {
      const out = new PassThrough()
      reader.stream(start, end).then(
        stream => {
          stream.once('error', error => out.destroy(error))
          stream.pipe(out)
        },
        error => out.destroy(error as Error)
      )
      return out
    }

    adapter.read = (buffer, offset, length, position, callback) => {
      reader.read(position, length).then(bytes => {
        if (bytes.length < length) {
          callback(new Error('unexpected EOF'))
          return
        }
        buffer.set(bytes.subarray(0, length), offset)
        callback(null)
      }, error => callback(error as Error))
    }

    adapter.close = callback => {
      reader.close().then(() => callback(null), error => callback(error as Error))
    }

    return adapter
  }

  const ofBuffer = (bytes: Uint8Array): RangeReader => ({
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, Math.min(offset + length, bytes.length)),
    stream: async (start, end) => Readable.from([Buffer.from(bytes.subarray(start, end))], { objectMode: false }),
    close: async () => undefined,
  })

  const ofFile = (path: string, size: number): RangeReader => {
    let handle: Promise<FileHandle> | undefined

    return {
      size,
      read: async (offset, length) => {
        handle ??= open(path, 'r')
        const count = Math.max(0, Math.min(length, size - offset))
        const buffer = Buffer.alloc(count)
        const { bytesRead } = await (await handle).read(buffer, 0, count, offset)
        return buffer.subarray(0, bytesRead)
      },
      stream: async (start, end) => end <= start
        ? Readable.from([], { objectMode: false })
        : createReadStream(path, { start, end: end - 1 }),
      close: async () => {
        const opened = handle
        handle = undefined
        if (opened != null) {
          await (await opened).close()
        }
      },
    }
  }

  return { zipReader, ofBuffer, ofFile }
}

export const rangeUtils = createRangeUtils()
