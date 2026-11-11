import type { FastifyInstance, FastifyRequest, FastifySchema, RouteHandlerMethod } from 'fastify'
import type { RouteMethod, StreamBody } from '@owlmeans/route'
import type { Readable } from 'node:stream'
import type { StreamedBody } from '../../types.js'
import type { STREAM_SOURCE, STREAM_STATE } from './consts.js'

/** One streamed-body route as the server registers it. */
export interface StreamRoute {
  alias: string
  url: string
  method: RouteMethod
  body: StreamBody
  schema: StreamRouteSchema
  handler: RouteHandlerMethod
}

/** The route schema without a body — params, query, headers and the response are still validated. */
export interface StreamRouteSchema extends FastifySchema {
  /** The declared content types, for documentation generators; the parser is what enforces them. */
  consumes?: string[]
}

/** What a streamed-body route keeps on its Fastify request. */
export interface StreamCarrier {
  [STREAM_SOURCE]?: StreamSource
  [STREAM_STATE]?: StreamState
}

/** The unread request stream the content-type parser found. */
export interface StreamSource {
  payload: Readable
  length?: number
  type?: string
}

export interface StreamState {
  body: StreamedBody
  /** Why the body failed — over the limit, or the client gone — once it has. */
  failure?: Error
}

/** The streamed-body routes of `server-api`: registration, the handler's body and its failure. */
export interface StreamBodyUtils {
  /**
   * Serve one streamed-body route in its own encapsulated Fastify scope: a content-type parser for
   * its declared types only (any other answers 415) that hands the request stream over unread, a
   * declared `Content-Length` over `maxBytes` refused with 413 before a byte is read, no
   * `fastify-raw-body` copy, no AJV body schema, and `Connection: close` on every answer sent before
   * the body was read to its end. Every other route keeps the root scope's parsers untouched.
   */
  register: (server: FastifyInstance, route: StreamRoute) => Promise<void>
  /**
   * The body of a streamed-body request, opened on the first call and the same object afterwards.
   * Throws `SyntaxError` for a request whose route declares no streamed body.
   */
  open: (request: FastifyRequest) => StreamedBody
  /** The body's own failure — what a failed handler answers with instead of whatever it threw. */
  failureOf: (request: FastifyRequest) => Error | undefined
}
