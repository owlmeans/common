import type { HttpProxyEndpoint } from '../proxy/types.js'

export interface TransportRequest {
  url: string
  headers: Record<string, string>
  signal: AbortSignal
  /** Send through this proxy; direct when absent. */
  endpoint?: HttpProxyEndpoint
}

/**
 * One HTTP GET on the current runtime — Bun's native fetch with its `proxy` option, or npm undici
 * with a `ProxyAgent` on Node (Bun shadows `undici` with its own shim, so the split is by runtime).
 * Redirects are never followed here: the fetcher guards every hop.
 */
export interface FetchTransport {
  send: (request: TransportRequest) => Promise<Response>
  close: () => Promise<void>
}

/** The npm undici module, imported lazily on Node only. */
export type Undici = typeof import('undici') // a module namespace type, not an object shape
