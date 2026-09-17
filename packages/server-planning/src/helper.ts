import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { PlanningFacade, PlanningProtocols, PlanningScope } from '@owlmeans/planning'
import { bind } from '@owlmeans/server-entrypoint'
import {
  executePlanning, getCard, getCommit, getSpecification, getTransition, listCardSpecifications,
  listCardTransitions, listCards, listLinks, listSchemas, listSpecificationRevisions, summarizeCards,
  watchCommits,
} from './actions/index.js'
import type { PlanningHandlerOptions } from './types.js'
import { planningServiceOf, scopeOf } from './utils/index.js'

/**
 * Bind this package's handlers to a tree declared by `makePlanningProtocols` — one binding per
 * protocol, the base included. Pass the tree itself, never a flattened list; an application that
 * wants its own handler for one leaf binds that protocol afterwards.
 */
export const servePlanningEntrypoints = (protocols: PlanningProtocols, opts?: PlanningHandlerOptions) => [
  bind(protocols.base),
  bind(protocols.schema.list, listSchemas(protocols.schema.list, opts)),
  bind(protocols.card.list, listCards(protocols.card.list, opts)),
  bind(protocols.card.summary, summarizeCards(protocols.card.summary, opts)),
  bind(protocols.card.get, getCard(protocols.card.get, opts)),
  bind(protocols.card.transitions, listCardTransitions(protocols.card.transitions, opts)),
  bind(protocols.card.specifications, listCardSpecifications(protocols.card.specifications, opts)),
  bind(protocols.spec.get, getSpecification(protocols.spec.get, opts)),
  bind(protocols.spec.revisions, listSpecificationRevisions(protocols.spec.revisions, opts)),
  bind(protocols.link.list, listLinks(protocols.link.list, opts)),
  bind(protocols.transition.get, getTransition(protocols.transition.get, opts)),
  bind(protocols.execute, executePlanning(protocols.execute, opts)),
  bind(protocols.commit.get, getCommit(protocols.commit.get, opts)),
  bind(protocols.commit.events, watchCommits(protocols.commit.events, opts)),
]

/**
 * The facade a hand-written handler works through: the request's entity and subject, plus `extra`
 * (a `channel`) — never an entity from the request body.
 *
 * @throws {AuthorizationError} when the request carries no organization
 */
export const planningFor = (
  ctx: BasicContext<BasicConfig>, req: AbstractRequest, extra?: Partial<PlanningScope>,
  opts?: Pick<PlanningHandlerOptions, 'service'>
): PlanningFacade => planningServiceOf(ctx, opts).for(scopeOf(req, extra))
