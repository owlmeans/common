
import type { InitializedService } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import '@fastify/middie/types/index.d.ts'

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
