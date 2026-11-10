import type { FetchPurpose } from './types.js'

/** An honest default identity; a site that refuses it can be given a browser user agent. */
export const DEFAULT_USER_AGENT = 'Mozilla/5.0 (compatible; OwlMeansReader/0.1; +https://owlmeans.com)'

export const DEFAULT_FETCH_TIMEOUT_MS = 30_000

export const DEFAULT_MAX_REDIRECTS = 5

/** Byte caps per purpose. */
export const DEFAULT_MAX_BYTES: Readonly<Record<FetchPurpose, number>> = Object.freeze({
  page: 10 * 1024 * 1024,
  stylesheet: 2 * 1024 * 1024,
  image: 8 * 1024 * 1024,
  any: 10 * 1024 * 1024,
})

export const ACCEPT_HEADERS: Readonly<Record<FetchPurpose, string>> = Object.freeze({
  page: 'text/html,application/xhtml+xml;q=0.9,text/plain;q=0.8,*/*;q=0.5',
  stylesheet: 'text/css,*/*;q=0.1',
  image: 'image/avif,image/webp,image/png,image/jpeg,image/svg+xml,image/*;q=0.8',
  any: '*/*',
})

/** Media types read as text. */
export const TEXT_TYPES: readonly RegExp[] = Object.freeze([
  /^text\//, /\+xml$/, /\/xml$/, /\/json$/, /\+json$/, /\/javascript$/, /\/ecmascript$/,
])
