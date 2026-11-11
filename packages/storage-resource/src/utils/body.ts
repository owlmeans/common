import { Readable, Transform, pipeline } from 'node:stream'
import { StorageApiError } from '@owlmeans/storage-common'
import type { BodyFailureListener, BodyUtils, BodyViolation, MeasuredBody, PeekedBody } from './body/types.js'

const bufferOf = (chunk: unknown): Buffer => {
  if (Buffer.isBuffer(chunk)) {
    return chunk
  }
  if (typeof chunk === 'string') {
    return Buffer.from(chunk)
  }
  const bytes = chunk as Uint8Array
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)
}

export const createBodyUtils = (): BodyUtils => {
  const discard = (stream: Readable): void => {
    stream.once('error', () => undefined)
    stream.destroy()
  }

  const peek = async (stream: Readable, size: number): Promise<PeekedBody> => {
    const iterator = stream[Symbol.asyncIterator]() as AsyncIterator<unknown>
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
        const chunk = bufferOf(next.value)
        chunks.push(chunk)
        length += chunk.length
      }
    } catch (error) {
      await iterator.return?.()
      throw error
    }

    const head = Buffer.concat(chunks, length)

    let finished = ended
    const replay = async function * (): AsyncGenerator<Buffer> {
      try {
        if (head.length > 0) {
          yield head
        }
        while (!finished) {
          const next = await iterator.next()
          if (next.done === true) {
            finished = true
            break
          }
          yield bufferOf(next.value)
        }
      } finally {
        if (!finished) {
          await iterator.return?.()
        }
      }
    }

    const replayed = Readable.from(replay(), { objectMode: false })
    // A replay destroyed before it was read never enters the generator: release the source here.
    replayed.once('close', () => {
      if (!finished) {
        finished = true
        stream.destroy()
      }
    })

    return { head, stream: replayed, ended }
  }

  const measure = (stream: Readable, expected: number, onFailure: BodyFailureListener): MeasuredBody => {
    let bytes = 0
    let missed: BodyViolation | undefined

    const counter = new Transform({
      transform: (chunk: Buffer, _encoding, callback) => {
        bytes += chunk.length
        if (bytes > expected) {
          missed = 'long'
          callback(new StorageApiError('body-long'))
          return
        }
        callback(null, chunk)
      },
      flush: callback => {
        if (bytes < expected) {
          missed = 'short'
          callback(new StorageApiError('body-short'))
          return
        }
        callback()
      },
    })

    pipeline(stream, counter, error => {
      if (error != null) {
        onFailure(error)
      }
    })

    return { stream: counter, bytes: () => bytes, violation: () => missed }
  }

  return { peek, measure, discard }
}

export const bodyUtils = createBodyUtils()
