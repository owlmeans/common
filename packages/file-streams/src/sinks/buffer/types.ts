import type { FileSink } from '../../types.js'

export interface BufferSinkOptions {
  /** Ceiling on collected bytes. Default 64 MiB. */
  maxBytes?: number
}

/** A sink that keeps what it receives in memory. */
export interface BufferSink extends FileSink {
  /** The bytes of the last write. */
  bytes: () => Uint8Array
}
