
import type { InitializedService } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import '@fastify/middie/types/index.d.ts'
import type { MultipartFile } from '@fastify/multipart'

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
