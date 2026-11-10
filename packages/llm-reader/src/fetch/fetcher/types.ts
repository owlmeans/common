import type { AddressGuard, AddressGuardOptions } from '../guard/types.js'
import type { ProxyLease } from '../proxy/types.js'
import type { FetchTransport } from '../transport/types.js'
import type { RenderedPage } from '../../render/types.js'

/** What is being fetched decides the `accept` header and which content types are let through. */
export type FetchPurpose = 'page' | 'stylesheet' | 'image' | 'any' // closed set of request purposes

export interface FetchRequest {
  url: string
  /** The proxy key (a tenant, a session); the target host when omitted. Sub-resources inherit it. */
  key?: string
  purpose?: FetchPurpose
  headers?: Record<string, string>
  signal?: AbortSignal
  /** Overrides the fetcher's timeout, ms. */
  timeout?: number
  /** Overrides the fetcher's byte cap. */
  maxBytes?: number
  /** Set by the proxy plugin: the proxy this attempt goes through. */
  lease?: ProxyLease
  /** Ask a renderer plugin to run the page's scripts (and sample styles). */
  render?: boolean
}

export interface FetchedResource {
  /** What was asked for. */
  url: string
  /** Where it ended up after redirects. */
  finalUrl: string
  status: number
  headers: Record<string, string>
  /** Lower-cased media type without parameters. */
  contentType: string
  charset?: string
  /** Decoded text for page / stylesheet / text content. */
  text?: string
  /** Raw bytes for images and other binary content. */
  bytes?: Uint8Array
  fetchedAt: string
  /** Every URL hopped through, the final one excluded. */
  redirects: string[]
  /** The masked id of the proxy used. */
  via?: string
  /** Set when a renderer produced this resource. */
  rendered?: RenderedPage
}

/** What a plugin is handed when the fetcher it belongs to is built. */
export interface ReaderFetchContext {
  guard: AddressGuard
}

/** Middleware around a fetch — the proxy plugin and a renderer plugin are two. */
export interface ReaderFetchPlugin {
  name: string
  /** Called once by the fetcher that owns the plugin. */
  attach?: (context: ReaderFetchContext) => void
  fetch?: (request: FetchRequest, next: (request: FetchRequest) => Promise<FetchedResource>) => Promise<FetchedResource>
  close?: () => Promise<void>
}

export interface PageFetcherOptions extends AddressGuardOptions {
  plugins?: ReaderFetchPlugin[]
  /** Sent with every request. Default names this package honestly. */
  userAgent?: string
  /** Per request, ms. Default 30 000. */
  timeout?: number
  /** Default 10 MB for pages, 2 MB for stylesheets, 8 MB for images. */
  maxBytes?: number
  maxRedirects?: number
  /** Statuses returned instead of thrown. Default: any status — a 404 page is still a page. */
  acceptStatus?: (status: number) => boolean
  /** Replace the runtime transport (tests, a custom egress). */
  transport?: FetchTransport
  /** Replace the address guard built from {@link allowPrivateNetwork} / {@link allowHosts}. */
  guard?: AddressGuard
}

export interface PageFetcher {
  /** Fetch through the plugin chain, following redirects with every hop guarded. */
  fetch: (request: FetchRequest) => Promise<FetchedResource>
  readonly guard: AddressGuard
  /** Close plugins and the transport. */
  close: () => Promise<void>
}
