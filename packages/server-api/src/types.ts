
import type { InitializedService } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import '@fastify/middie/types/index.d.ts'
import type { MultipartFile } from '@fastify/multipart'
import type { Readable } from 'node:stream'

export interface ApiServer extends InitializedService {
  server: FastifyInstance

  listen: () => Promise<void>
}

export interface Request extends FastifyRequest { }

export interface Response extends FastifyReply { }

export interface ApiServerAppend {
  getApiServer: () => ApiServer
}

export type HttpErrorExposure = 'production' | 'development'

export interface HttpErrorsConfig {
  /** Production is the safe default; development is the only mode that exposes stacks. */
  exposure?: HttpErrorExposure
}

export interface HttpConfig {
  errors?: HttpErrorsConfig
}

export interface Config extends ServerConfig {
  http?: HttpConfig
}

export interface Context<C extends Config = Config> extends ServerContext<C>,
  ApiServerAppend { }

export interface UploadedFile extends MultipartFile { }

/**
 * The body of a streamed-body route (`streamBody()` of `@owlmeans/route`) as its handler reads it —
 * from `streamedBody(request)`, never through `request.original`.
 */
export interface StreamedBody {
  /**
   * The request body, unbuffered, with backpressure to the client. It errors with
   * `StreamBodyTooLargeError` once more than `maxBytes` arrive and with `StreamBodyAbortedError`
   * when the client goes away; an empty request is an empty stream. Opened once per request: every
   * call answers the same stream.
   */
  stream: Readable
  /** The declared `Content-Length`, when the client sent one (already checked against `maxBytes`). */
  length?: number
  /** The request's `Content-Type` — one of the route's declared types. */
  type?: string
  /** The route's declared limit. */
  maxBytes: number
}

export interface ApiPortHoldOptions {
  /**
   * The one path answered 200 while the hold is in place — the app's health endpoint, so
   * whatever supervises the process keeps a conventional liveness answer through the boot.
   * Everything else answers 503 with the same body. Absent, everything is 503.
   */
  okPath?: string
  /** Body of every answer, evaluated per request so a changing boot phase is reported live. */
  payload?: () => unknown
}

export interface ApiPortHold {
  /**
   * Free the port for the real server. Awaits the actual close — `listen()` follows immediately,
   * and a predecessor still bound makes it throw — and force-closes keep-alive sockets, so a
   * supervisor's own poller cannot hold the release open.
   */
  release: () => Promise<void>
}
