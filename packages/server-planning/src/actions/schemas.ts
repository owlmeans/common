import { handlers } from '@owlmeans/server-api'
import type { PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { planningServiceOf, scopeOf } from '../utils/index.js'

/** The schema bundle the service holds — what a client loads to answer `can()` with no round trip. */
export const listSchemas = (
  protocol: PlanningProtocols['schema']['list'], opts?: PlanningHandlerOptions
): ReturnType<ReturnType<typeof handlers<Context>>['request']> =>
  handlers<Context>().request(protocol, async (req, ctx) => {
    // Scoped like every other leaf: no organization, no bundle.
    scopeOf(req)

    return planningServiceOf(ctx, opts).schemas.bundle()
  })
