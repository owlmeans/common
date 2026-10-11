import type { FastifyBaseLogger, LogController } from 'fastify'
import type { Logger } from '@owlmeans/log'

/** All a log record may say about a request: its method and its path — never the query string. */
export interface RequestSummary {
  method?: string
  path?: string
}

/**
 * How the API server's Fastify instance logs: through `@owlmeans/log`, and never with what a caller
 * sent — a body, a raw body, multipart bytes, headers, cookies or a query string.
 */
export interface FastifyLogUtils {
  /**
   * A pino-shaped logger over `log` (scope `http` by default), handed to Fastify as its
   * `loggerInstance`. Every record's data — Fastify's own and any plugin's — passes `safeData`.
   */
  logger: (log?: Logger, bindings?: Record<string, unknown>) => FastifyBaseLogger
  /**
   * The `logController` Fastify writes its own request lines through: no per-request pair (the
   * server writes one debug record from `onResponse`), a request the default error handler answers
   * is `failure`, a missing route is one debug line without its query.
   */
  controller: () => LogController
  /**
   * A copy of a record's data that is safe to write: a request becomes its `RequestSummary`, a reply
   * its status, bytes their size, any other class instance its name; the keys that carry what a
   * caller sent (`body`, `rawBody`, `headers`, `query`, `cookies`, files…) are dropped at every depth
   * (a number or boolean under them stays: a count, a flag), and any string loses the query of a URL
   * it names. An `Error` passes as it is (a copy, when its message names a URL with a query) — the
   * log writes only its name, message, code and stack.
   */
  safeData: (data: unknown) => unknown
  /** The method and the path, without the query string, of a Fastify or Node request. */
  requestOf: (request: unknown) => RequestSummary
  /**
   * The one record of a failed request, by what its status means: 5xx `error` with the error,
   * 403 `warn` `access.forbidden`, 401 `debug` `auth.refused`, any other 4xx `debug` with the error's
   * code and message. Method, path and status only — never the request's content.
   */
  failure: (error: Error, request: unknown, status: number, incidentId?: string) => void
}
