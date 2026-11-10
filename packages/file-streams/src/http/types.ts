import type { Readable } from 'node:stream'
import type { NetworkPolicy, NetworkPolicyOptions } from '../network/types.js'
import type { ProxyRouter, ProxyRouterOptions } from '../proxy/types.js'
import type { UrlResolver } from '../resolvers/types.js'
import type { ByteRange, FileInfo, FileSource, SignalOptions } from '../types.js'

export interface HttpTimeouts {
  /** TCP (and proxy handshake) connect. Default 10 000 ms. */
  connectMs: number
  /** From the request to the response head. Default 30 000 ms. */
  headersMs: number
  /** Longest silence while the body flows. Default 30 000 ms. */
  idleMs: number
}

export interface HttpClientOptions {
  network?: NetworkPolicy | NetworkPolicyOptions
  proxies?: ProxyRouter | ProxyRouterOptions
  /** Default `[googleDriveResolver]`; `[]` turns resolving off. */
  resolvers?: UrlResolver[]
  timeouts?: Partial<HttpTimeouts>
  /** Default 5. */
  maxRedirects?: number
  userAgent?: string
  /** Sent with every request. */
  headers?: Record<string, string>
  /** Dropped on a cross-origin redirect, beside `authorization`, `cookie` and `proxy-authorization`. */
  sensitiveHeaders?: string[]
  /** Extra CAs (verification is never turned off). */
  ca?: string | string[]
}

/** The two methods a download issues. */
// A closed pair of HTTP verbs — a union.
export type HttpMethod = 'GET' | 'HEAD'

export interface HttpRequestOptions extends SignalOptions {
  method?: HttpMethod
  headers?: Record<string, string>
  range?: ByteRange
  /** Routing key for `by-key` pools and proxy providers. */
  proxyKey?: string
  /** Skip the URL resolvers. */
  raw?: boolean
  /** Send `If-Range` with this strong validator. */
  ifRange?: string
}

export interface HttpResponse {
  /** The final URL; redact before logging. */
  url: URL
  status: number
  headers: Record<string, string | string[] | undefined>
  /** The body, transport-decoded (never a gzip file itself), idle-guarded, length-checked. */
  body: Readable
  info: FileInfo
  redirects: number
}

export interface HttpSourceOptions {
  headers?: Record<string, string>
  proxyKey?: string
  raw?: boolean
  /** The file name to claim, over what the response says. */
  name?: string
}

/** Downloads under the network policy, through proxies, redirects and resolvers. */
export interface HttpClient {
  /** One GET or HEAD; a non-2xx answer is `HttpError('status:<code>')`. */
  request: (url: string | URL, options?: HttpRequestOptions) => Promise<HttpResponse>
  /** A re-openable source; Range-capable when the server answers 206 with Content-Range. */
  source: (url: string | URL, options?: HttpSourceOptions) => FileSource
}
