import type { Readable } from 'node:stream'

/**
 * Reads a request body nobody consumed to its end, so the answer reaches a client that is still
 * sending (an early answer would close the connection under it). Bounded by the route's `maxBytes`.
 */
export const drain = async (stream: Readable): Promise<void> => {
  if (stream.readableEnded || stream.destroyed || stream.errored != null) {
    return
  }
  await new Promise<void>(resolve => {
    const done = (): void => {
      stream.off('end', done)
      stream.off('close', done)
      stream.off('error', done)
      resolve()
    }
    stream.on('end', done)
    stream.on('close', done)
    stream.on('error', done)
    stream.resume()
  })
}
