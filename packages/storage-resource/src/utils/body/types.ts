import type { Readable, Transform } from 'node:stream'

/** Which way a body missed its declared length. */
// A closed set of two directions — a union is the honest type.
export type BodyViolation = 'short' | 'long'

export interface PeekedBody {
  /** The leading bytes read: the asked size, or the whole body when it ended first. */
  head: Buffer
  /** The whole body again, head included, read on demand. */
  stream: Readable
  /** Whether the head is the whole body. */
  ended: boolean
}

export interface MeasuredBody {
  /** The pass-through to send: refuses past the expected length and at an end short of it. */
  readonly stream: Transform
  /** Bytes that passed so far. */
  bytes: () => number
  /** How the body missed its length, once it did. */
  violation: () => BodyViolation | undefined
}

/** Interface of the failure callback a measured body reports to. */
export interface BodyFailureListener {
  (error: Error): void
}

/** Streams an upload body without holding it: a head to verify, then the rest on demand, counted. */
export interface BodyUtils {
  /** Reads the head of a stream and hands back a stream that replays it, then the rest as it is read. */
  peek: (stream: Readable, size: number) => Promise<PeekedBody>
  /**
   * `stream` through a counter that fails once it passes `expected` bytes or ends short of them;
   * that failure, and the source's own, reach `onFailure` (which aborts the request carrying it).
   */
  measure: (stream: Readable, expected: number, onFailure: BodyFailureListener) => MeasuredBody
  /** Destroys a stream nobody will read, swallowing its error. */
  discard: (stream: Readable) => void
}
