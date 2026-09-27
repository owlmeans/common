import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import type { ListResult } from '@owlmeans/resource'
import { backend, route, RouteMethod, socket } from '@owlmeans/route'
import type { RouteOptions } from '@owlmeans/route'
import { PLANNING_PATH, planningAliases } from './consts.js'
import {
  CommitQuerySchema, ExecuteRequestSchema, RelationshipQuerySchema, RevisionsQuerySchema,
  SpecificationQuerySchema, SummaryQuerySchema, TransitionParamsSchema, TransitionQuerySchema,
  WorkcardParamsSchema, WorkcardQuerySchema,
} from './schemas.js'
import type {
  CommitEvent, CommitFeedQuery, CommitQuery, CommitStatus, ExecuteRequest, PlanningProtocolOptions,
  PlanningProtocols, PlanningSchemaBundle, Relationship, RelationshipQueryWire, RevisionsQuery,
  Specification, SpecificationQueryWire, SpecificationRevisionList, SummaryQueryWire, SummaryView,
  Transition, TransitionParams, TransitionQueryWire, TransitionReceiptView, Workcard, WorkcardParams,
  WorkcardQueryWire,
} from './types.js'

/**
 * Declare the planning surface — one immutable tree a server binds and a client calls.
 *
 * Every leaf hangs under ONE base carrying the guards (and the gate), so they cannot drift apart;
 * aliases derive from `opts.base.alias`. Static `/cards/summary` is declared before parametric
 * `/cards/:id`. The commit feed is a socket under `socketBase` when given (it then inherits that
 * base's guards), under the planning base otherwise.
 *
 * Queries travel as their `*Wire` shapes: encode with `encode*Query` before a call, decode with
 * `decode*Query` in a handler.
 */
export const makePlanningProtocols = (opts: PlanningProtocolOptions): PlanningProtocols => {
  const aliases = planningAliases(opts.base.alias)
  const mount: Partial<RouteOptions> = {
    ...(opts.base.parent != null ? { parent: opts.base.parent } : {}),
    ...(opts.base.service != null ? { service: opts.base.service } : {}),
  }

  const base = openProtocol(route(aliases.base, opts.base.path ?? PLANNING_PATH, backend(mount)), {
    guards: opts.guards,
    ...(opts.gate != null ? { gate: opts.gate } : {}),
  })
  const get = (alias: string, path: string) => route(alias, path, backend({ parent: base }, RouteMethod.GET))

  return Object.freeze({
    base,

    schema: Object.freeze({
      list: protocol(get(aliases.schema.list, '/schemas'), contract(typed<PlanningSchemaBundle>())),
    }),

    card: Object.freeze({
      list: protocol(
        get(aliases.card.list, '/cards'),
        contract.request({ query: typed<WorkcardQueryWire>(WorkcardQuerySchema) }, typed<ListResult<Workcard>>())
      ),
      // Static before parametric: `/cards/summary` must never be read as a card id.
      summary: protocol(
        get(aliases.card.summary, '/cards/summary'),
        contract.request({ query: typed<SummaryQueryWire>(SummaryQuerySchema) }, typed<SummaryView>())
      ),
      get: protocol(
        get(aliases.card.get, '/cards/:id'),
        contract.request({ params: typed<WorkcardParams>(WorkcardParamsSchema) }, typed<Workcard>())
      ),
      transitions: protocol(
        get(aliases.card.transitions, '/cards/:id/transitions'),
        contract.request({
          params: typed<WorkcardParams>(WorkcardParamsSchema),
          query: typed<TransitionQueryWire>(TransitionQuerySchema),
        }, typed<ListResult<Transition>>())
      ),
      specifications: protocol(
        get(aliases.card.specifications, '/cards/:id/specifications'),
        contract.request({
          params: typed<WorkcardParams>(WorkcardParamsSchema),
          query: typed<SpecificationQueryWire>(SpecificationQuerySchema),
        }, typed<ListResult<Specification>>())
      ),
    }),

    spec: Object.freeze({
      get: protocol(
        get(aliases.spec.get, '/specifications/:id'),
        contract.request({ params: typed<WorkcardParams>(WorkcardParamsSchema) }, typed<Specification>())
      ),
      revisions: protocol(
        get(aliases.spec.revisions, '/specifications/:id/revisions'),
        contract.request({
          params: typed<WorkcardParams>(WorkcardParamsSchema),
          query: typed<RevisionsQuery>(RevisionsQuerySchema),
        }, typed<SpecificationRevisionList>())
      ),
    }),

    link: Object.freeze({
      list: protocol(
        get(aliases.link.list, '/links'),
        contract.request({ query: typed<RelationshipQueryWire>(RelationshipQuerySchema) }, typed<ListResult<Relationship>>())
      ),
    }),

    transition: Object.freeze({
      get: protocol(
        get(aliases.transition.get, '/transitions/:transition'),
        contract.request({ params: typed<TransitionParams>(TransitionParamsSchema) }, typed<Transition>())
      ),
    }),

    execute: protocol(
      route(aliases.execute, '/execute', backend({ parent: base }, RouteMethod.POST)),
      contract.request({ body: typed<ExecuteRequest>(ExecuteRequestSchema) }, typed<TransitionReceiptView>())
    ),

    commit: Object.freeze({
      get: protocol(
        get(aliases.commit.get, '/commits/:transition'),
        contract.request({
          params: typed<TransitionParams>(TransitionParamsSchema),
          query: typed<CommitQuery>(CommitQuerySchema),
        }, typed<CommitStatus>())
      ),
      events: protocol(
        route(aliases.commit.events, '/commits', socket({ parent: opts.socketBase ?? base })),
        contract.request({ query: typed<CommitFeedQuery>() }, typed<CommitEvent>())
      ),
    }),
  })
}
