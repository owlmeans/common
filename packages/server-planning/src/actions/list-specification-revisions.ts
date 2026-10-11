import { handlers } from '@owlmeans/server-api'
import type { PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { guardHelper } from '../utils/guard.js'
import { planningHandlerOf } from '../utils/handler.js'
import type { RequestHandler } from './types.js'

/** A document's history, newest first, replayed from its log. */
export const listSpecificationRevisions = (protocol: PlanningProtocols['spec']['revisions'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => guardHelper.reply(async () => {
    const facade = await planningHandlerOf(ctx).handlerFacade(req, opts)
    const limit = req.query?.limit == null ? undefined : Number(req.query.limit)

    return { items: await facade.specifications.revisions(`${req.params.id}`, Number.isFinite(limit) ? limit : undefined) }
  }))
