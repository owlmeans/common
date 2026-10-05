import { handlers } from '@owlmeans/server-api'
import type { PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { guardHelper } from '../utils/guard.js'
import { planningHandlerOf } from '../utils/handler.js'
import type { RequestHandler } from './types.js'

/** @throws {WorkcardNotFound} for an absent transition and for another entity's alike */
export const getTransition = (
  protocol: PlanningProtocols['transition']['get'], opts?: PlanningHandlerOptions
): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => guardHelper.concealed(async () => {
    const facade = await planningHandlerOf(ctx).handlerFacade(req, opts)

    return await facade.transitions.get(`${req.params.transition}`)
  }))
