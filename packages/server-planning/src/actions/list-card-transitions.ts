import { handlers } from '@owlmeans/server-api'
import { wireHelper, type PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { guardHelper } from '../utils/guard.js'
import { planningHandlerOf } from '../utils/handler.js'
import type { RequestHandler } from './types.js'

/** One card's log. */
export const listCardTransitions = (protocol: PlanningProtocols['card']['transitions'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => guardHelper.concealed(async () => {
    const facade = await planningHandlerOf(ctx).handlerFacade(req, opts)
    const card = await facade.cards.get(`${req.params.id}`)

    return await facade.transitions.list({ ...wireHelper.decodeTransitionQuery(req.query), card: card.id })
  }))
