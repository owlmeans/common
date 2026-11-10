import { connect as connectTcp } from 'node:net'
import type { Socket } from 'node:net'
import { connect as connectTls } from 'node:tls'
import { ProxyError } from '../errors.js'
import { signalUtils } from '../utils/signals.js'
import { CONNECT_MAX_HEADER_BYTES } from './consts.js'
import type { HttpProxyPluginOptions, ProxyConnectContext, ProxyConnection, ProxyEndpoint, ProxyPlugin, TunnelTarget } from './types.js'

/** HTTP(S) proxies: CONNECT tunnels, and forward mode for plain-http targets. */
export const createHttpProxyPlugin = (options: HttpProxyPluginOptions = {}): ProxyPlugin => {
  const authorization = (endpoint: ProxyEndpoint): string | undefined => endpoint.username != null
    ? `Basic ${Buffer.from(`${endpoint.username}:${endpoint.password ?? ''}`).toString('base64')}`
    : undefined

  const open = (endpoint: ProxyEndpoint, context: ProxyConnectContext): Promise<Socket> => new Promise((resolve, reject) => {
    const socket: Socket = endpoint.type === 'https'
      ? connectTls({ host: endpoint.host, port: endpoint.port, servername: endpoint.host, ca: options.ca, minVersion: 'TLSv1.2' })
      : connectTcp({ host: endpoint.host, port: endpoint.port })
    const timer = setTimeout(() => fail(new ProxyError('connect')), context.timeoutMs)
    const release = signalUtils.onAbort(context.signal, reason => fail(reason as Error))
    const done = (): void => {
      clearTimeout(timer)
      release()
      socket.removeListener('error', fail)
    }
    function fail (error: Error): void {
      done()
      socket.destroy()
      reject(error instanceof ProxyError || context.signal?.aborted === true ? error : new ProxyError('connect'))
    }
    socket.once(endpoint.type === 'https' ? 'secureConnect' : 'connect', () => {
      done()
      resolve(socket)
    })
    socket.once('error', fail)
  })

  const tunnel = (socket: Socket, endpoint: ProxyEndpoint, target: TunnelTarget, context: ProxyConnectContext): Promise<void> =>
    new Promise((resolve, reject) => {
      const authority = target.host.includes(':') ? `[${target.host}]:${target.port}` : `${target.host}:${target.port}`
      const auth = authorization(endpoint)
      const chunks: Buffer[] = []
      let length = 0
      const timer = setTimeout(() => fail(new ProxyError('handshake')), context.timeoutMs)
      const release = signalUtils.onAbort(context.signal, reason => fail(reason as Error))

      const cleanup = (): void => {
        clearTimeout(timer)
        release()
        socket.removeListener('data', onData)
        socket.removeListener('error', onError)
        socket.removeListener('close', onClose)
      }
      function fail (error: Error): void {
        cleanup()
        socket.destroy()
        reject(error)
      }
      const onError = (): void => fail(new ProxyError('handshake'))
      const onClose = (): void => fail(new ProxyError('handshake'))
      function onData (chunk: Buffer): void {
        chunks.push(chunk)
        length += chunk.length
        const buffer = Buffer.concat(chunks, length)
        const end = buffer.indexOf('\r\n\r\n')
        if (end === -1) {
          if (length > CONNECT_MAX_HEADER_BYTES) {
            fail(new ProxyError('handshake'))
          }
          return
        }
        cleanup()
        const status = Number(/^HTTP\/1\.[01] (\d{3})/.exec(buffer.subarray(0, end).toString('latin1'))?.[1])
        if (status === 200) {
          const rest = buffer.subarray(end + 4)
          if (rest.length > 0) {
            socket.unshift(rest)
          }
          resolve()
          return
        }
        socket.destroy()
        reject(new ProxyError(status === 407 ? 'auth-failed' : `refused:${Number.isNaN(status) ? 'invalid' : status}`))
      }

      socket.on('data', onData)
      socket.once('error', onError)
      socket.once('close', onClose)
      socket.write(
        `CONNECT ${authority} HTTP/1.1\r\nHost: ${authority}\r\n${auth != null ? `Proxy-Authorization: ${auth}\r\n` : ''}\r\n`
      )
    })

  const connect = async (endpoint: ProxyEndpoint, target: TunnelTarget, context: ProxyConnectContext): Promise<ProxyConnection> => {
    const socket = await open(endpoint, context)
    if (!target.secure && options.httpTargets !== 'connect') {
      const auth = authorization(endpoint)
      return { socket, mode: 'forward', headers: auth != null ? { 'proxy-authorization': auth } : undefined }
    }
    await tunnel(socket, endpoint, target, context)

    return { socket, mode: 'tunnel' }
  }

  return { types: ['http', 'https'], remoteDns: () => options.remoteDns === true, connect }
}

export const httpProxyPlugin = createHttpProxyPlugin()
