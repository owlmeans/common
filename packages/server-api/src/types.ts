
import type { InitializedService, Layer } from '@owlmeans/context'
import type { FastifyReply, FastifyRequest } from 'fastify'

export interface ApiServer extends InitializedService {
  layers: [Layer.System]
}

export interface Request extends FastifyRequest { }

export interface Response extends FastifyReply { }

export interface ApiServerAppend {
  getApiServer: () => ApiServer
}
