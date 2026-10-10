import { handlers } from '@owlmeans/server-api'
import type { PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { guardHelper } from '../utils/guard.js'
import { planningHandlerOf } from '../utils/handler.js'
import type { RequestHandler } from './types.js'

/** @throws {WorkcardNotFound} */
export const getSpecification = (protocol: PlanningProtocols['spec']['get'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => guardHelper.reply(async () => {
    const facade = await planningHandlerOf(ctx).handlerFacade(req, opts)

    return await facade.specifications.get(`${req.params.id}`)
  }))
