import { ReaderContentError } from '../errors.js'
import type { PeekableBody } from './types.local.js'

/** A body whose head is read once and replayed: a source looks at it, the collector still gets every byte. */
export const makePeekableBody = (body: ReadableStream<Uint8Array>): PeekableBody => {
  const reader = body.getReader()
  const head: Uint8Array[] = []
  let size = 0
  let done = false

  const peek: PeekableBody['peek'] = async maxBytes => {
    while (!done && size < maxBytes) {
      const next = await reader.read()
      if (next.done) {
        done = true
        break
      }
      head.push(next.value)
      size += next.value.byteLength
    }
    const bytes = new Uint8Array(Math.min(size, maxBytes))
    let offset = 0
    for (const chunk of head) {
      if (offset >= bytes.length) break
      const part = chunk.subarray(0, bytes.length - offset)
      bytes.set(part, offset)
      offset += part.byteLength
    }
    return new TextDecoder('utf-8').decode(bytes)
  }

  const stream: PeekableBody['stream'] = () => new ReadableStream<Uint8Array>({
    pull: async controller => {
      const buffered = head.shift()
      if (buffered != null) {
        controller.enqueue(buffered)
        return
      }
      if (done) {
        controller.close()
        return
      }
      const next = await reader.read()
      if (next.done) controller.close()
      else controller.enqueue(next.value)
    },
    cancel: reason => reader.cancel(reason),
  })

  const read: PeekableBody['read'] = async maxBytes => {
    const chunks: Uint8Array[] = []
    let total = 0
    const all = stream().getReader()
    for (;;) {
      const next = await all.read()
      if (next.done) break
      total += next.value.byteLength
      if (total > maxBytes) {
        await all.cancel().catch(() => undefined)
        throw new ReaderContentError(`too-large:>${maxBytes}`)
      }
      chunks.push(next.value)
    }
    const bytes = new Uint8Array(total)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.byteLength
    }
    return bytes
  }

  const cancel: PeekableBody['cancel'] = () => reader.cancel().catch(() => undefined)

  return { peek, stream, read, cancel }
}
