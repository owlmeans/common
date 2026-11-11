import type { Readable } from 'node:stream'
import type { StreamHead, StreamUtils } from './streams/types.js'

export const createStreamUtils = (): StreamUtils => {
  const discard = (stream: Readable): void => {
    stream.once('error', () => undefined)
    stream.destroy()
  }

  const head = async (stream: Readable, size: number): Promise<StreamHead> => {
    const iterator = stream[Symbol.asyncIterator]() as AsyncIterator<Buffer | string>
    const chunks: Buffer[] = []
    let length = 0
    let ended = false

    try {
      while (length < size) {
        const next = await iterator.next()
        if (next.done === true) {
          ended = true
          break
        }
        const chunk = typeof next.value === 'string' ? Buffer.from(next.value) : next.value
        chunks.push(chunk)
        length += chunk.length
      }
    } finally {
      if (!ended) {
        discard(stream)
      }
    }

    return { head: Buffer.concat(chunks, length), ended }
  }

  return { head, discard }
}

export const streamUtils = createStreamUtils()
