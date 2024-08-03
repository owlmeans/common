
import type { InitializedService, Layer } from '@owlmeans/context'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'

export interface ApiServer extends InitializedService {
  server: FastifyInstance

  layers: [Layer.System]

  listen: () => Promise<void>
}

export interface Request extends FastifyRequest { }

export interface Response extends FastifyReply { }

export interface ApiServerAppend {
  getApiServer: () => ApiServer
}

export interface Config extends ServerConfig { }

export interface Context<C extends Config = Config> extends ServerContext<C>,
  ApiServerAppend { }
