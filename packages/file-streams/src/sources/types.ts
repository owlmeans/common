import type { Readable } from 'node:stream'

/** What a caller knows about bytes it hands over — claims a verdict checks, never facts. */
export interface SourceClaims {
  name?: string
  mime?: string
  size?: number
}

/** A stream in any shape the package accepts: Node, web, or any async iterable of bytes. */
// A union of unrelated stream shapes — an interface cannot express it.
export type StreamInput = Readable | ReadableStream<Uint8Array> | AsyncIterable<Uint8Array>
