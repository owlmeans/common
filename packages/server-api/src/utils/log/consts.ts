/**
 * Keys of a Fastify log record that carry what a caller sent. They are dropped at every depth: a
 * request body and its raw form (`rawBody`), multipart fields and file buffers, headers (with the
 * authorization and cookie values), cookies and the parsed query string.
 */
export const UNSAFE_LOG_KEYS: ReadonlySet<string> = new Set([
  'body', 'rawBody', 'payload', 'files', 'file', 'headers', 'rawHeaders', 'trailers', 'rawTrailers',
  'query', 'querystring', 'cookies', 'cookie', 'authorization',
])

/** Deepest nesting `safeData` walks; anything below is one marker. */
export const SAFE_DATA_DEPTH = 4

/**
 * The query string of a path or URL inside free text (a Fastify warning names `"/x?token=…"`): the
 * path is kept (`$1`), the query is cut.
 */
export const QUERY_IN_TEXT = /(\/[^\s?"'`]*)\?[^\s"'`)]+/g
