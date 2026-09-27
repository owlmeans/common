import { handlers } from '@owlmeans/server-api'
import {
  decodeSpecificationQuery, decodeSummaryQuery, decodeTransitionQuery, decodeWorkcardQuery,
} from '@owlmeans/planning'
import type { PlanningProtocols } from '@owlmeans/planning'
import type { Context, PlanningHandlerOptions } from '../types.js'
import { concealed, handlerFacade } from '../utils/index.js'

type RequestHandler = ReturnType<ReturnType<typeof handlers<Context>>['request']>

/** Cards of the caller's entity; the query arrives in its wire shape and is decoded here. */
export const listCards = (protocol: PlanningProtocols['card']['list'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async () => {
    const facade = await handlerFacade(ctx, req, opts)

    return await facade.cards.list(decodeWorkcardQuery(req.query))
  }))

/** Intrinsic counts of DIRECT children per parent. */
export const summarizeCards = (protocol: PlanningProtocols['card']['summary'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async () => {
    const facade = await handlerFacade(ctx, req, opts)
    const { parents, ...query } = decodeSummaryQuery(req.query)

    return await facade.cards.summary(parents, query)
  }))

/** @throws {WorkcardNotFound} for an absent card and for another entity's alike */
export const getCard = (protocol: PlanningProtocols['card']['get'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async () => {
    const facade = await handlerFacade(ctx, req, opts)

    return await facade.cards.get(`${req.params.id}`)
  }))

/** One card's log. */
export const listCardTransitions = (protocol: PlanningProtocols['card']['transitions'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async () => {
    const facade = await handlerFacade(ctx, req, opts)
    const card = await facade.cards.get(`${req.params.id}`)

    return await facade.transitions.list({ ...decodeTransitionQuery(req.query), card: card.id })
  }))

/** One card's specifications — the current document per category unless `all`. */
export const listCardSpecifications = (protocol: PlanningProtocols['card']['specifications'], opts?: PlanningHandlerOptions): RequestHandler =>
  handlers<Context>().request(protocol, async (req, ctx) => concealed(async () => {
    const facade = await handlerFacade(ctx, req, opts)
    const card = await facade.cards.get(`${req.params.id}`)

    return await facade.specifications.list(card.id!, decodeSpecificationQuery(req.query))
  }))
