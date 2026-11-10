import type { HttpTimeouts } from './types.js'

export const DEFAULT_HTTP_TIMEOUTS: Readonly<HttpTimeouts> = Object.freeze({ connectMs: 10_000, headersMs: 30_000, idleMs: 30_000 })

export const DEFAULT_MAX_REDIRECTS = 5

export const REDIRECT_STATUSES: readonly number[] = Object.freeze([301, 302, 303, 307, 308])

/** Headers never carried to another origin. */
export const ALWAYS_SENSITIVE_HEADERS: readonly string[] = Object.freeze(['authorization', 'cookie', 'proxy-authorization'])

/** Bytes a resolver may read from a page by default. */
export const DEFAULT_RESOLVER_PAGE_BYTES = 256 * 1024
