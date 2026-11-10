import type { ITokenizer } from 'strtok3'
import type { RandomAccessReader as ZipRandomAccessReader } from 'yauzl'
import type { RangeReader } from '../../types.js'

export interface CachedRangeOptions {
  /** Bytes fetched per block. */
  blockSize?: number
  /** Blocks kept; the oldest is dropped past it. */
  maxBlocks?: number
  /** Total bytes the reader may fetch, else `LimitError('probe-budget')`. */
  budget?: number
}

export interface CachedRangeReader extends RangeReader {
  /** Bytes fetched from the underlying reader so far. */
  bytesRead: () => number
}

export interface TokenizerInfo {
  mimeType?: string
  path?: string
}

export interface RangeUtils {
  /** A block cache with a byte budget over a reader. */
  cached: (reader: RangeReader, options?: CachedRangeOptions) => CachedRangeReader
  /** A random-access strtok3 tokenizer (what file-type reads through) over a reader. */
  tokenizer: (reader: RangeReader, info?: TokenizerInfo) => ITokenizer
  /** A yauzl random-access reader (central-directory zip reading) over a reader. */
  zipReader: (reader: RangeReader) => ZipRandomAccessReader
  /** A reader over bytes in memory. */
  ofBuffer: (bytes: Uint8Array) => RangeReader
  /** A reader over a regular file of known size. */
  ofFile: (path: string, size: number) => RangeReader
}
