import type { Readable, Transform } from 'node:stream'
import type { StreamInput } from '../../sources/types.js'

export interface MeterProgress {
  bytes: number
  total?: number
  elapsedMs: number
}

export interface MeterOptions {
  /** Refuse with `LimitError('max-bytes')` past this many bytes. */
  maxBytes?: number
  /** Refuse with `LimitError('idle-timeout')` after this long without a chunk. */
  idleTimeoutMs?: number
  /** The expected total, reported with progress. */
  total?: number
  onProgress?: (progress: MeterProgress) => void
  progressIntervalMs?: number
  hash?: 'sha256'
}

export interface StreamMeter {
  /** The pass-through to pipe the bytes through. */
  readonly stream: Transform
  /** Bytes that passed so far. */
  bytes: () => number
  /** Hex sha256 of what passed, once the stream ended and a hash was asked for. */
  sha256: () => string | undefined
}

export interface PeekedStream {
  /** The leading bytes read (at least the asked size unless the stream ended first). */
  head: Uint8Array
  /** The whole stream again, head included. */
  stream: Readable
  /** Whether the head is the whole stream. */
  ended: boolean
}

export interface SpoolOptions {
  maxBytes?: number
  signal?: AbortSignal
}

export interface SpooledFile {
  path: string
  size: number
  /** Removes the file and its private directory. */
  dispose: () => Promise<void>
}

export interface StreamUtils {
  /** A Node stream over any accepted input. */
  toReadable: (input: StreamInput | Uint8Array) => Readable
  /** Counting, limiting, idle-guarding, hashing pass-through. */
  meter: (options: MeterOptions) => StreamMeter
  /** Reads the head of a stream and hands back a stream that replays it. */
  peek: (stream: Readable, size: number) => Promise<PeekedStream>
  /** The whole stream in memory, refused past `maxBytes`. */
  collect: (stream: Readable, maxBytes: number) => Promise<Buffer>
  /** The stream written to a private temporary file. */
  spool: (stream: Readable, options?: SpoolOptions) => Promise<SpooledFile>
  /** Destroys a stream nobody will read, swallowing its error. */
  discard: (stream: Readable) => void
}
