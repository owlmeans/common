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

/**
 * What a 3xx answer does: `follow` (default) goes on to its `Location` under the policy; `manual`
 * returns the 3xx response itself, `Location` included, for a caller that checks every hop itself.
 */
// A closed pair of modes — a union.
export type HttpRedirectMode = 'follow' | 'manual'

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
  /**
   * Default `follow`. `manual` returns a 3xx answer (with its `Location`) instead of following it.
   * A resolver's own flow (a Drive virus-scan page, its hops) still runs inside the client under the
   * policy, because it carries its cookie across those hops.
   */
  redirect?: HttpRedirectMode
  /**
   * Return every status instead of throwing `HttpError('status:<code>')` — a 404 page is an answer.
   * A forward proxy's 407 still throws `ProxyError('auth-failed')`: that is the proxy, not the target.
   */
  anyStatus?: boolean
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
  /** The body was transport-decoded (`Content-Encoding` undone); its `Content-Length` no longer applies. */
  decoded?: boolean
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
  /** One GET or HEAD; a non-2xx answer is `HttpError('status:<code>')` unless `anyStatus` (or a 3xx under `redirect: 'manual'`). */
  request: (url: string | URL, options?: HttpRequestOptions) => Promise<HttpResponse>
  /** A re-openable source; Range-capable when the server answers 206 with Content-Range. */
  source: (url: string | URL, options?: HttpSourceOptions) => FileSource
}
