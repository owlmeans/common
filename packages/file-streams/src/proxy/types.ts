import type { Duplex } from 'node:stream'

/** One proxy. `type` names the plugin that speaks to it. */
export interface ProxyEndpoint {
  /** `http`, `https`, `socks4`, `socks4a`, `socks5`, `socks5h`, or a custom plugin's type. */
  type: string
  host: string
  port: number
  username?: string
  password?: string
  /** A credential-free name for logs; default `<type>://<host>:<port>`. */
  id?: string
}

export interface ProxyCredentials {
  username: string
  password: string
}

/** What a proxy is chosen for: the caller's routing key and the URL. */
export interface ProxyRequest {
  key?: string
  url: URL
}

/** A pool as a callback: the proxy (credentials included) for a key and a URL, or nothing to go direct. */
export interface ProxyProvider {
  (request: ProxyRequest): ProxyEndpoint | string | null | undefined | Promise<ProxyEndpoint | string | null | undefined>
}

/** Credentials for a chosen endpoint that carries none (a per-key session user, a vault lookup). */
export interface ProxyCredentialsProvider {
  (endpoint: ProxyEndpoint, request: ProxyRequest): ProxyCredentials | null | undefined | Promise<ProxyCredentials | null | undefined>
}

/** How a list of proxies is walked. */
// A closed set of strategies — a union.
export type ProxyStrategy = 'round-robin' | 'random' | 'failover' | 'by-key'

export interface ProxyRouterOptions {
  /** Endpoints or URLs (`socks5h://user:pass@egress:1080`), or a provider callback. */
  proxies?: Array<ProxyEndpoint | string> | ProxyProvider
  credentials?: ProxyCredentialsProvider
  /** Default `round-robin`; `by-key` keeps one key on one proxy. */
  strategy?: ProxyStrategy
  /** Hosts (`x.com`, `*.x.com`) never proxied. */
  bypass?: string[]
  /** Plugins tried before the built-in http and socks ones. */
  plugins?: ProxyPlugin[]
  /** Further proxies tried after a failed connect. Default 1. */
  retries?: number
  /** How long a failed proxy is skipped. Default 30 000 ms. */
  cooldownMs?: number
}

export interface ProxySelection {
  endpoint: ProxyEndpoint
  plugin: ProxyPlugin
}

/** Chooses the proxy of each connection. */
export interface ProxyRouter {
  /** Further attempts after a failed connect. */
  readonly retries: number
  /** The proxy for a request, or `null` to connect directly. */
  select: (request: ProxyRequest) => Promise<ProxySelection | null>
  /** How a connect through `endpoint` went; failures cool it down. */
  report: (endpoint: ProxyEndpoint, ok: boolean) => void
}

export interface TunnelTarget {
  /** The checked IP, or the host name when the proxy resolves it. */
  host: string
  port: number
  /** The host name (SNI, `Host`). */
  hostname: string
  /** TLS rides inside the tunnel; a plugin never terminates it. */
  secure: boolean
}

export interface ProxyConnectContext {
  signal?: AbortSignal
  timeoutMs: number
}

export interface ProxyConnection {
  socket: Duplex
  /** `forward`: absolute-form plain HTTP through the proxy (http targets only). */
  mode: 'tunnel' | 'forward'
  /** Headers a forward-mode request carries (`Proxy-Authorization`). */
  headers?: Record<string, string>
}

/** Speaks one or more proxy protocols. */
export interface ProxyPlugin {
  readonly types: string[]
  /** Whether the proxy resolves names itself for this endpoint. */
  remoteDns: (endpoint: ProxyEndpoint) => boolean
  connect: (endpoint: ProxyEndpoint, target: TunnelTarget, context: ProxyConnectContext) => Promise<ProxyConnection>
}

export interface HttpProxyPluginOptions {
  /** How plain-http targets travel. Default `forward` (proxies often refuse CONNECT to port 80). */
  httpTargets?: 'forward' | 'connect'
  /** Put the host name, not the checked IP, in CONNECT. Default `false`. */
  remoteDns?: boolean
  /** Extra CAs for `https` proxy endpoints. */
  ca?: string | string[]
}

export interface SocksProxyPluginOptions {
  /** Let socks4/socks5 endpoints resolve names too; socks4a/socks5h always do. Default `false`. */
  remoteDns?: boolean
}
