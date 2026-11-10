import type { AddressGuard } from '../guard/types.js'
import type { HttpProxyEndpoint, ProxySpec } from '../proxy/types.js'

export interface SocksBridgeOptions {
  /** Re-checks targets the bridge resolves itself (socks4 / socks5 resolve locally). */
  guard?: AddressGuard
  /** SOCKS handshake deadline, ms. Default 15 000. */
  connectTimeout?: number
}

/**
 * A local HTTP proxy in front of SOCKS proxies, so every client — Bun's fetch, undici, a browser —
 * only ever speaks HTTP proxy. One listener on 127.0.0.1 serves every upstream: each gets its own
 * random credentials, and a request is routed by the credentials it presents.
 */
export interface SocksBridge {
  /** The HTTP proxy endpoint routed to this SOCKS upstream; starts the listener on first use. */
  endpoint: (spec: ProxySpec) => Promise<HttpProxyEndpoint>
  close: () => Promise<void>
}
