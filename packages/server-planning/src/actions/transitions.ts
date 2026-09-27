import { handlers } from '@owlmeans/server-api'
import type { PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { concealed, handlerFacade } from '../utils/index.js'

/** @throws {WorkcardNotFound} for an absent transition and for another entity's alike */
export const getTransition = (
  protocol: PlanningProtocols['transition']['get'], opts?: PlanningHandlerOptions
): ReturnType<ReturnType<typeof handlers<Context>>['request']> =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async () => {
    const facade = await handlerFacade(ctx, req, opts)

    return await facade.transitions.get(`${req.params.transition}`)
  }))
