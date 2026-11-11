import { connect as connectTcp, isIP } from 'node:net'
import type { Socket } from 'node:net'
import type { Duplex } from 'node:stream'
import { connect as connectTls } from 'node:tls'
import { logger } from '@owlmeans/log'
import { HttpError, NetworkPolicyError, ProxyError } from '../errors.js'
import type { NetworkPolicy, ResolvedAddress } from '../network/types.js'
import type { ProxyRouter } from '../proxy/types.js'
import { redactUtils } from '../utils/redact.js'
import { signalUtils } from '../utils/signals.js'
import type { HttpTimeouts } from './types.js'
import type { Connection, HttpConnector } from './types.local.js'

const log = logger('file-streams:http')

/**
 * Connections the policy approved: a direct socket goes to an address that was resolved and
 * checked a moment before (no second lookup to rebind), a proxied one carries that address into
 * the tunnel; TLS is layered on top with the host name for SNI and certificate checks.
 */
export const makeHttpConnector = (
  policy: NetworkPolicy, router: ProxyRouter, timeouts: HttpTimeouts, ca?: string | string[]
): HttpConnector => {
  const tcp = (address: ResolvedAddress, port: number, signal?: AbortSignal): Promise<Socket> => new Promise((resolve, reject) => {
    const socket = connectTcp({ host: address.address, port, family: address.family })
    const timer = setTimeout(() => fail(new HttpError('connect-timeout')), timeouts.connectMs)
    const release = signalUtils.onAbort(signal, reason => fail(reason as Error))
    function fail (error: Error): void {
      clearTimeout(timer)
      release()
      socket.destroy()
      reject(error)
    }
    socket.once('connect', () => {
      clearTimeout(timer)
      release()
      socket.removeAllListeners('error')
      resolve(socket)
    })
    socket.once('error', () => fail(new HttpError('connect')))
  })

  const direct = async (addresses: ResolvedAddress[], port: number, signal?: AbortSignal): Promise<Socket> => {
    let last: unknown
    for (const address of addresses) {
      try {
        return await tcp(address, port, signal)
      } catch (error) {
        if (signal?.aborted === true) {
          throw error
        }
        last = error
      }
    }
    throw last ?? new HttpError('connect')
  }

  const tls = (socket: Duplex, hostname: string, signal?: AbortSignal): Promise<Duplex> => new Promise((resolve, reject) => {
    const literal = isIP(hostname) !== 0
    const secure = connectTls({
      socket, host: hostname, servername: literal ? undefined : hostname, ALPNProtocols: ['http/1.1'], minVersion: 'TLSv1.2', ca,
    })
    const timer = setTimeout(() => fail(new HttpError('tls-timeout')), timeouts.connectMs)
    const release = signalUtils.onAbort(signal, reason => fail(reason as Error))
    function fail (error: Error): void {
      clearTimeout(timer)
      release()
      secure.destroy()
      socket.destroy()
      reject(error)
    }
    secure.once('secureConnect', () => {
      clearTimeout(timer)
      release()
      secure.removeAllListeners('error')
      resolve(secure)
    })
    secure.once('error', error => fail(error instanceof HttpError ? error : new HttpError(`tls:${(error as NodeJS.ErrnoException).code ?? 'failed'}`)))
  })

  const proxied = async (url: URL, hostname: string, port: number, secure: boolean, proxyKey: string | undefined, signal?: AbortSignal): Promise<Connection | null> => {
    let attempts = 0
    for (;;) {
      const selection = await router.select({ key: proxyKey, url })
      if (selection == null) {
        return null
      }
      const { endpoint, plugin } = selection
      let host = hostname
      if (plugin.remoteDns(endpoint)) {
        try {
          await policy.resolve(hostname, signal)
        } catch (error) {
          if (!(error instanceof NetworkPolicyError) || error.message !== 'file-streams:policy:unresolvable' || !policy.trustProxyDns) {
            throw error
          }
        }
      } else {
        host = (await policy.resolve(hostname, signal))[0].address
      }
      try {
        const connection = await plugin.connect(endpoint, { host, port, hostname, secure }, { signal, timeoutMs: timeouts.connectMs })
        router.report(endpoint, true)
        log.debug('Connected through a proxy', { proxy: redactUtils.proxy(endpoint), mode: connection.mode })
        return { socket: connection.socket, mode: connection.mode, headers: connection.headers }
      } catch (error) {
        if (signal?.aborted === true) {
          throw error
        }
        router.report(endpoint, false)
        if (++attempts > router.retries) {
          throw error instanceof ProxyError ? error : new ProxyError('connect')
        }
      }
    }
  }

  const connect = async (url: URL, proxyKey: string | undefined, signal?: AbortSignal): Promise<Connection> => {
    const secure = url.protocol === 'https:'
    const hostname = url.hostname.replace(/^\[|\]$/g, '')
    const port = url.port !== '' ? Number(url.port) : secure ? 443 : 80

    let connection = await proxied(url, hostname, port, secure, proxyKey, signal)
    if (connection == null) {
      const addresses = await policy.resolve(hostname, signal)
      connection = { socket: await direct(addresses, port, signal), mode: 'direct' }
    }
    if (secure && connection.mode !== 'forward') {
      connection = { ...connection, socket: await tls(connection.socket, hostname, signal) }
    }

    return connection
  }

  return { connect }
}
