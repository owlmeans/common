import type { Readable } from 'node:stream'

export interface StreamHead {
  /** The leading bytes read (at least the asked size unless the stream ended first). */
  head: Uint8Array
  /** Whether the head is the whole stream. */
  ended: boolean
}

export interface StreamUtils {
  /** Reads the head of a stream, then destroys the stream. */
  head: (stream: Readable, size: number) => Promise<StreamHead>
  /** Destroys a stream nobody will read, swallowing its error. */
  discard: (stream: Readable) => void
}
