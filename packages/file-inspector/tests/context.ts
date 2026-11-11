import { Readable } from 'node:stream'
import type { ProbeRangeReader, ProbeSource } from '../src/index.js'

export interface SourceOptions {
  name?: string
  mime?: string
  /** Offer random access (default) or only a body stream. */
  ranges?: boolean
  /** Declared size reported by `info` (default: the real one). */
  size?: number
}

export interface CountedSource extends ProbeSource {
  /** Bytes handed out through range reads and the body stream. */
  served: () => number
  /** Range reads made. */
  reads: () => number
}

/**
 * A stand-in origin over bytes in memory — what an HTTP origin with Range support, a bucket or a
 * spooled file offers the probe, with the bytes it serves counted.
 */
export const sourceOf = (data: Uint8Array, options: SourceOptions = {}): CountedSource => {
  let served = 0
  let reads = 0

  const reader: ProbeRangeReader = {
    size: data.length,
    read: async (offset, length) => {
      reads++
      const slice = data.subarray(offset, Math.min(offset + length, data.length))
      served += slice.length
      return slice
    },
    close: async () => undefined,
  }

  return {
    info: async () => ({ origin: 'memory', name: options.name, mime: options.mime, size: options.size ?? data.length }),
    open: async () => {
      const chunks = function * (): Generator<Buffer> {
        for (let offset = 0; offset < data.length; offset += 16384) {
          const piece = Buffer.from(data.subarray(offset, offset + 16384))
          served += piece.length
          yield piece
        }
      }
      return { stream: Readable.from(chunks(), { objectMode: false }) }
    },
    ranges: async () => options.ranges === false ? null : reader,
    served: () => served,
    reads: () => reads,
  }
}
