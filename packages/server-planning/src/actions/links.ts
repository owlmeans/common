import { handlers } from '@owlmeans/server-api'
import { wireHelper } from '@owlmeans/planning'
import type { PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { guardHelper } from '../utils/guard.js'
import { planningHandlerOf } from '../utils/handler.js'
import type { RequestHandler } from './types.js'

export const listLinks = (
  protocol: PlanningProtocols['link']['list'], opts?: PlanningHandlerOptions
): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => guardHelper.reply(async () => {
    const facade = await planningHandlerOf(ctx).handlerFacade(req, opts)

    return await facade.relationships.list(wireHelper.decodeRelationshipQuery(req.query))
  }))
