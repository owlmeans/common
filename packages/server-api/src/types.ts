
import type { InitializedService, Layer } from '@owlmeans/context'
import type { FastifyReply, FastifyRequest } from 'fastify'
import type { BasicModuleHandler } from './utils/types.js'
import type { Context } from './helper.js'
import type { AbstractRequest, AbstractResponse, ModuleOutcome } from '@owlmeans/module'

export interface ApiServer extends InitializedService {
  layers: [Layer.System]
}

export interface Request extends FastifyRequest { }

export interface Response extends FastifyReply { }

export interface ModuleHandler<
  Req extends AbstractRequest = AbstractRequest,
  Rep extends AbstractResponse<any> = AbstractResponse<any>,
  Ctx extends Context = Context
> extends BasicModuleHandler {
  (req: Req, res: Rep, ctx: Ctx): Promise<Ctx | void>
}

export interface ApiServerAppend {
  getApiServer: () => ApiServer
}

export interface ResponseHandler<T> extends AbstractResponse<T> {
  value?: T,
  outcome?: ModuleOutcome
  error?: Error
}
