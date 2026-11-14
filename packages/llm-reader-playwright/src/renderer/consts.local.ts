/** Request headers a page's sub-request carries into an injected fetch. */
export const FULFIL_REQUEST_HEADERS: readonly string[] = Object.freeze([
  'accept', 'accept-language', 'user-agent', 'referer', 'range', 'if-none-match', 'if-modified-since', 'cache-control',
])

/** Response headers never handed back to the browser: the body is decoded and whole. */
export const FULFIL_DROPPED_HEADERS: readonly string[] = Object.freeze([
  'content-encoding', 'content-length', 'transfer-encoding', 'connection', 'keep-alive',
])
