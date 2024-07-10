
import type { InitializedService, Layer } from '@owlmeans/context'
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
