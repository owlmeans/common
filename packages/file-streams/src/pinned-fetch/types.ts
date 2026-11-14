import type { HttpClient, HttpClientOptions } from '../http/types.js'

/**
 * A WHATWG-`fetch`-compatible function over the package's HTTP client: every connection is pinned
 * to an address the network policy checked a moment before (no second lookup to rebind), every
 * redirect hop is checked again, URL resolvers (Google Drive) apply, and bodies stream. Only GET and
 * HEAD are carried; any status comes back as a `Response` (a 404 page is an answer), a refusal of the
 * policy rejects with `NetworkPolicyError` (`refused === true`).
 */
export interface PinnedFetch {
  (input: string | URL | Request, init?: RequestInit): Promise<Response>
}

export interface PinnedFetchOptions extends HttpClientOptions {
  /** A ready client instead of one built from these options. */
  client?: HttpClient
}
