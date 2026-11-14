/** Request headers the pinned fetch never forwards: hop-by-hop, the host it sets itself, and any encoding but identity. */
export const PINNED_FETCH_DROPPED_REQUEST_HEADERS: readonly string[] = Object.freeze([
  'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade', 'te', 'host', 'accept-encoding', 'content-length',
])

/** Response headers that describe the connection, not the answer. */
export const PINNED_FETCH_DROPPED_RESPONSE_HEADERS: readonly string[] = Object.freeze([
  'connection', 'keep-alive', 'proxy-connection', 'transfer-encoding', 'upgrade',
])

/** Statuses a `Response` must carry without a body. */
export const NULL_BODY_STATUSES: readonly number[] = Object.freeze([101, 103, 204, 205, 304])

/** The methods the pinned fetch carries. */
export const PINNED_FETCH_METHODS: readonly string[] = Object.freeze(['GET', 'HEAD'])
