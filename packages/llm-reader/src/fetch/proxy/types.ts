import type { ProxyStrategy } from '../../consts.js'
import type { FetchRequest, ReaderFetchPlugin } from '../fetcher/types.js'

export type ProxyProtocol = 'http' | 'https' | 'socks4' | 'socks4a' | 'socks5' | 'socks5h' // the schemes a proxy URL may carry

/** One proxy, credentials included. Parsed from `scheme://user:pass@host:port` or `host:port:user:pass`. */
export interface ProxySpec {
  protocol: ProxyProtocol
  host: string
  port: number
  username?: string
  password?: string
  /** A stable label for reports and logs; derived (credentials masked) when omitted. */
  id?: string
  /** Extra headers sent to an HTTP(S) proxy (a session or country selector). */
  headers?: Record<string, string>
}

/** An HTTP(S) proxy any client can use — the upstream itself, or the local SOCKS bridge in front of one. */
export interface HttpProxyEndpoint {
  /** `http(s)://user:pass@host:port` — what a fetch `proxy` option or a ProxyAgent takes. */
  url: string
  /** `http(s)://host:port` without credentials — what a browser proxy setting takes. */
  server: string
  username?: string
  password?: string
  headers?: Record<string, string>
  /** It is the local bridge (one route per upstream; never reuse its connections across routes). */
  bridged: boolean
}

/** How one request through a proxy ended. */
export interface ProxyOutcome {
  ok: boolean
  /** The target's status, when one came back. */
  status?: number
  /** Why the proxy failed. */
  reason?: string
}

/** A proxy chosen for one request. */
export interface ProxyLease {
  /** The masked id — safe to log. */
  readonly id: string
  readonly spec: ProxySpec
  /** The endpoint to send through — starts the SOCKS bridge on first use. */
  endpoint: () => Promise<HttpProxyEndpoint>
  /** Feed the outcome back: a failure cools the proxy down. */
  report: (outcome: ProxyOutcome) => void
}

/** What a resolver is told about the request it picks a proxy for. */
export interface ProxyRequestInfo {
  url: string
  host: string
  /** 0-based: a retry after a failed proxy asks again. */
  attempt: number
  /** The masked id of the proxy that just failed, on a retry. */
  failed?: string
}

/**
 * Pick the proxy for a request key. A spec or URL is used (credentials included); `'direct'`
 * sends the request without a proxy; `undefined` defers to the configured list.
 */
export interface ProxyResolver {
  (key: string, info: ProxyRequestInfo): ProxySpec | string | 'direct' | undefined | Promise<ProxySpec | string | 'direct' | undefined>
}

export interface ProxyPluginOptions {
  /** The pool, as URLs (`socks5h://user:pass@host:1080`, `http://host:3128`, `host:port:user:pass`) or specs. */
  proxies?: (string | ProxySpec)[]
  /** Called first for every request; see {@link ProxyResolver}. */
  resolve?: ProxyResolver
  strategy?: ProxyStrategy
  /** Proxies tried per request before the failure surfaces. Default 3. */
  attempts?: number
  /** How long a failed proxy is skipped, ms. Default 60 000. */
  cooldown?: number
  /** Target statuses that count as a proxy failure and rotate (a ban page, a rate limit). Default 407, 429, 502, 503. */
  rotateOn?: number[]
  /** Observe every outcome — feed an external pool's health tracking. */
  onOutcome?: (proxy: string, outcome: ProxyOutcome, key: string) => void
}

/** The integrated proxy plugin: a fetch plugin, plus leases for anything else that needs a proxy (a browser). */
export interface ProxyPlugin extends ReaderFetchPlugin {
  /** The proxy for this request, or `undefined` for a direct one. */
  lease: (request: FetchRequest, attempt?: number, failed?: string) => Promise<ProxyLease | undefined>
  /** Stop the SOCKS bridge, if it started. */
  close: () => Promise<void>
}
