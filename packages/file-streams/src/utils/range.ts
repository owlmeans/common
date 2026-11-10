import { createReadStream } from 'node:fs'
import { open } from 'node:fs/promises'
import type { FileHandle } from 'node:fs/promises'
import { PassThrough, Readable } from 'node:stream'
import yauzl from 'yauzl'
import type { RandomAccessReader as ZipRandomAccessReader } from 'yauzl'
import { LimitError } from '../errors.js'
import type { RangeReader } from '../types.js'
import { DEFAULT_BLOCK_SIZE, DEFAULT_MAX_BLOCKS } from './range/consts.js'
import { makeRangeTokenizer } from './range/tokenizer.js'
import type { CachedRangeOptions, CachedRangeReader, RangeUtils, TokenizerInfo } from './range/types.js'

export const createRangeUtils = (): RangeUtils => {
  const cached = (reader: RangeReader, options: CachedRangeOptions = {}): CachedRangeReader => {
    const blockSize = options.blockSize ?? DEFAULT_BLOCK_SIZE
    const maxBlocks = options.maxBlocks ?? DEFAULT_MAX_BLOCKS
    const blocks = new Map<number, Promise<Uint8Array>>()
    let fetched = 0

    const block = (index: number, signal?: AbortSignal): Promise<Uint8Array> => {
      const known = blocks.get(index)
      if (known != null) {
        blocks.delete(index)
        blocks.set(index, known)
        return known
      }
      const start = index * blockSize
      const length = Math.min(blockSize, reader.size - start)
      if (options.budget != null && fetched + length > options.budget) {
        return Promise.reject(new LimitError('probe-budget'))
      }
      fetched += length
      const loading = reader.read(start, length, signal)
      loading.catch(() => blocks.delete(index))
      blocks.set(index, loading)
      while (blocks.size > maxBlocks) {
        blocks.delete(blocks.keys().next().value as number)
      }

      return loading
    }

    const read = async (offset: number, length: number, signal?: AbortSignal): Promise<Uint8Array> => {
      const end = Math.min(offset + length, reader.size)
      if (end <= offset) {
        return new Uint8Array(0)
      }
      const out = new Uint8Array(end - offset)
      for (let index = Math.floor(offset / blockSize); index * blockSize < end; index++) {
        const start = index * blockSize
        const bytes = await block(index, signal)
        const from = Math.max(offset, start)
        const to = Math.min(end, start + bytes.length)
        if (to > from) {
          out.set(bytes.subarray(from - start, to - start), from - offset)
        }
      }

      return out
    }

    return {
      size: reader.size,
      read,
      stream: async (start, end, signal) => await reader.stream(start, end, signal),
      close: async () => {
        blocks.clear()
        await reader.close()
      },
      bytesRead: () => fetched,
    }
  }

  const tokenizer = (reader: RangeReader, info?: TokenizerInfo): ReturnType<RangeUtils['tokenizer']> =>
    makeRangeTokenizer(reader, info)

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

  return { cached, tokenizer, zipReader, ofBuffer, ofFile }
}

export const rangeUtils = createRangeUtils()
