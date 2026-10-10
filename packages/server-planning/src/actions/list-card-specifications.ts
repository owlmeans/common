import { handlers } from '@owlmeans/server-api'
import { wireHelper, type PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { guardHelper } from '../utils/guard.js'
import { planningHandlerOf } from '../utils/handler.js'
import type { RequestHandler } from './types.js'

/** One card's specifications — the current document per category unless `all`. */
export const listCardSpecifications = (protocol: PlanningProtocols['card']['specifications'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => guardHelper.reply(async () => {
    const facade = await planningHandlerOf(ctx).handlerFacade(req, opts)
    const card = await facade.cards.get(`${req.params.id}`)

    return await facade.specifications.list(card.id!, wireHelper.decodeSpecificationQuery(req.query))
  }))
