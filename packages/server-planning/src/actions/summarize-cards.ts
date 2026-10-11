import { handlers } from '@owlmeans/server-api'
import { wireHelper, type PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { guardHelper } from '../utils/guard.js'
import { planningHandlerOf } from '../utils/handler.js'
import type { RequestHandler } from './types.js'

/** Intrinsic counts of DIRECT children per parent. */
export const summarizeCards = (protocol: PlanningProtocols['card']['summary'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => guardHelper.reply(async () => {
    const facade = await planningHandlerOf(ctx).handlerFacade(req, opts)
    const { parents, ...query } = wireHelper.decodeSummaryQuery(req.query)

    return await facade.cards.summary(parents, query)
  }))
