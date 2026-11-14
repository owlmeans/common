import type { HttpProxyEndpoint } from '../proxy/types.js'

export interface TransportRequest {
  url: string
  headers: Record<string, string>
  signal: AbortSignal
  /** Send through this proxy; direct when absent. */
  endpoint?: HttpProxyEndpoint
}

/** The request options an injected {@link FetchFunction} is called with — a subset of `RequestInit`. */
export interface FetchInit {
  method?: string
  headers?: Record<string, string>
  signal?: AbortSignal
  /** The reader always asks for `manual`: it checks every hop itself. */
  redirect?: 'follow' | 'manual' | 'error'
}

/**
 * A WHATWG-`fetch`-compatible function the reader sends every request through instead of the runtime
 * transport — `@owlmeans/file-streams/fetch`'s `createPinnedFetch()`, whose connections are pinned to
 * the address its policy checked (no DNS rebinding between the guard and the connect). It must answer
 * `redirect: 'manual'` with the 3xx itself and any status as a `Response`. A rejection whose error
 * carries `refused === true` is a refusal (reported as `ReaderRefusedError('pinned:…')`), anything
 * else a network failure.
 */
export interface FetchFunction {
  (input: string, init?: FetchInit): Promise<Response>
}

export interface FetchTransportOptions {
  /** Send through this fetch instead of the runtime's; proxied requests are then refused (configure proxies on the fetch). */
  fetch?: FetchFunction
}

/**
 * One HTTP GET on the current runtime — Bun's native fetch with its `proxy` option, or npm undici
 * with a `ProxyAgent` on Node (Bun shadows `undici` with its own shim, so the split is by runtime).
 * Redirects are never followed here: the fetcher guards every hop. With an injected
 * {@link FetchFunction} every request goes through it instead.
 */
export interface FetchTransport {
  send: (request: TransportRequest) => Promise<Response>
  close: () => Promise<void>
}

/** The npm undici module, imported lazily on Node only. */
export type Undici = typeof import('undici') // a module namespace type, not an object shape
