import { connect, createServer } from 'node:net'
import type { AddressInfo, Socket } from 'node:net'

/** A loopback TCP relay in front of an endpoint that counts the bytes a client sent through it. */
export interface CountingProxy {
  /** `http://127.0.0.1:<port>` — address the client here instead of the target. */
  readonly endpoint: string
  /** Bytes received from clients so far — what has left the client process. */
  received: () => number
  /** Stops listening and drops every connection. */
  close: () => Promise<void>
}

/**
 * Starts a relay to `target` (an `http://host:port` URL). It reads clients as fast as they send —
 * never pausing them for a slow upstream — so `received()` is what a client has written, not what
 * the upstream has taken.
 */
export const startCountingProxy = async (target: string): Promise<CountingProxy> => {
  const url = new URL(target)
  const sockets = new Set<Socket>()
  let received = 0

  const server = createServer(client => {
    const upstream = connect(Number(url.port !== '' ? url.port : 80), url.hostname)
    sockets.add(client)
    sockets.add(upstream)
    const drop = (): void => {
      client.destroy()
      upstream.destroy()
    }
    client.on('data', (chunk: Buffer) => {
      received += chunk.length
      upstream.write(chunk)
    })
    client.on('end', () => { upstream.end() })
    upstream.pipe(client)
    client.on('error', drop)
    upstream.on('error', drop)
    client.on('close', () => {
      sockets.delete(client)
      upstream.destroy()
    })
    upstream.on('close', () => {
      sockets.delete(upstream)
      client.destroy()
    })
  })

  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  const close = async (): Promise<void> => {
    sockets.forEach(socket => socket.destroy())
    await new Promise<void>(resolve => server.close(() => resolve()))
  }

  return { endpoint: `http://127.0.0.1:${port}`, received: () => received, close }
}
