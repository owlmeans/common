import type { ITokenizer } from 'strtok3'
import type { ProbeRangeReader } from '../../types.js'

export interface CachedRangeOptions {
  /** Bytes fetched per block. */
  blockSize?: number
  /** Blocks kept; the oldest is dropped past it. Default: enough for the whole budget. */
  maxBlocks?: number
  /** Total bytes the reader may fetch, else `ProbeBudgetError`. */
  budget?: number
}

export interface CachedRangeReader extends ProbeRangeReader {
  /** Bytes fetched from the underlying reader so far. */
  bytesRead: () => number
}

export interface TokenizerInfo {
  mimeType?: string
  path?: string
}

export interface RangeUtils {
  /** A block cache with a byte budget over a reader. */
  cached: (reader: ProbeRangeReader, options?: CachedRangeOptions) => CachedRangeReader
  /** A random-access strtok3 tokenizer (what file-type reads through) over a reader. */
  tokenizer: (reader: ProbeRangeReader, info?: TokenizerInfo) => ITokenizer
}
