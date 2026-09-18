import { handlers } from '@owlmeans/server-api'
import type { PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { concealed, handlerFacade } from '../utils/index.js'

type RequestHandler = ReturnType<ReturnType<typeof handlers<Context>>['request']>

/** @throws {WorkcardNotFound} */
export const getSpecification = (protocol: PlanningProtocols['spec']['get'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async () => {
    const facade = await handlerFacade(ctx, req, opts)

    return await facade.specifications.get(`${req.params.id}`)
  }))

/** A document's history, newest first, replayed from its log. */
export const listSpecificationRevisions = (protocol: PlanningProtocols['spec']['revisions'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async () => {
    const facade = await handlerFacade(ctx, req, opts)
    const limit = req.query?.limit == null ? undefined : Number(req.query.limit)

    return { items: await facade.specifications.revisions(`${req.params.id}`, Number.isFinite(limit) ? limit : undefined) }
  }))
