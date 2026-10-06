import { handlers } from '@owlmeans/server-api'
import { wireHelper, type PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { guardHelper } from '../utils/guard.js'
import { planningHandlerOf } from '../utils/handler.js'
import type { RequestHandler } from './types.js'

/** Cards of the caller's entity; the query arrives in its wire shape and is decoded here. */
export const listCards = (protocol: PlanningProtocols['card']['list'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => guardHelper.concealed(async () => {
    const facade = await planningHandlerOf(ctx).handlerFacade(req, opts)

    return await facade.cards.list(wireHelper.decodeWorkcardQuery(req.query))
  }))
