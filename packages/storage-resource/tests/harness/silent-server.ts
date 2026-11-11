import { createServer } from 'node:net'
import type { AddressInfo, Socket } from 'node:net'

/** A loopback server that accepts connections and never answers — what a hung store looks like. */
export interface SilentServer {
  /** `http://127.0.0.1:<port>`. */
  readonly endpoint: string
  close: () => Promise<void>
}

export const startSilentServer = async (): Promise<SilentServer> => {
  const sockets = new Set<Socket>()
  const server = createServer(socket => {
    sockets.add(socket)
    socket.on('error', () => undefined)
    socket.on('close', () => sockets.delete(socket))
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address() as AddressInfo

  const close = async (): Promise<void> => {
    sockets.forEach(socket => socket.destroy())
    await new Promise<void>(resolve => server.close(() => resolve()))
  }

  return { endpoint: `http://127.0.0.1:${port}`, close }
}
