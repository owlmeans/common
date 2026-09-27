import { handlers } from '@owlmeans/server-api'
import { decodeRelationshipQuery } from '@owlmeans/planning'
import type { PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { concealed, handlerFacade } from '../utils/index.js'

export const listLinks = (
  protocol: PlanningProtocols['link']['list'], opts?: PlanningHandlerOptions
): ReturnType<ReturnType<typeof handlers<Context>>['request']> =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async () => {
    const facade = await handlerFacade(ctx, req, opts)

    return await facade.relationships.list(decodeRelationshipQuery(req.query))
  }))
