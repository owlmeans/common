/** Where the content-type parser leaves the unread request stream for `streamedBody()`. */
export const STREAM_SOURCE = Symbol('owlmeans.server-api.stream-source')

/** Where the opened body (and its failure, if any) is kept, so a request opens it once. */
export const STREAM_STATE = Symbol('owlmeans.server-api.stream-state')

/** The route `config` key carrying the route's resolved `StreamBody`. */
export const STREAM_ROUTE_CONFIG = 'owlmeansStreamBody'

/** The methods whose requests carry a body Fastify hands to a content-type parser. */
export const STREAM_METHODS: readonly string[] = Object.freeze(['post', 'put', 'patch'])

/** Bytes the handler's stream buffers before the request stream is paused. */
export const STREAM_HIGH_WATER_MARK = 64 * 1024
