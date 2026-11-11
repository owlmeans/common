import { SocksClient } from 'socks'
import { ProxyError } from '../errors.js'
import { signalUtils } from '../utils/signals.js'
import type { ProxyConnectContext, ProxyConnection, ProxyEndpoint, ProxyPlugin, SocksProxyPluginOptions, TunnelTarget } from './types.js'

/** SOCKS4, SOCKS4a, SOCKS5 and SOCKS5h proxies, with user/password authentication. */
export const createSocksProxyPlugin = (options: SocksProxyPluginOptions = {}): ProxyPlugin => {
  const remoteDns = (endpoint: ProxyEndpoint): boolean =>
    endpoint.type === 'socks5h' || endpoint.type === 'socks4a' || options.remoteDns === true

  const connect = async (endpoint: ProxyEndpoint, target: TunnelTarget, context: ProxyConnectContext): Promise<ProxyConnection> => {
    signalUtils.throwIfAborted(context.signal)
    const pending = SocksClient.createConnection({
      command: 'connect',
      destination: { host: target.host, port: target.port },
      proxy: {
        host: endpoint.host,
        port: endpoint.port,
        type: endpoint.type.startsWith('socks4') ? 4 : 5,
        userId: endpoint.username,
        password: endpoint.password,
      },
      timeout: context.timeoutMs,
    })

    let release = (): void => undefined
    const aborted = new Promise<never>((_resolve, reject) => {
      release = signalUtils.onAbort(context.signal, reason => reject(reason))
    })
    try {
      const { socket } = await Promise.race([pending, aborted])
      return { socket, mode: 'tunnel' }
    } catch (error) {
      pending.then(({ socket }) => socket.destroy(), () => undefined)
      if (context.signal?.aborted === true) {
        throw error
      }
      const message = (error as Error).message ?? ''
      throw new ProxyError(/auth/i.test(message) ? 'auth-failed' : /rejected|refused|failed/i.test(message) ? 'refused:socks' : 'connect')
    } finally {
      release()
    }
  }

  return { types: ['socks4', 'socks4a', 'socks5', 'socks5h'], remoteDns, connect }
}

export const socksProxyPlugin = createSocksProxyPlugin()
