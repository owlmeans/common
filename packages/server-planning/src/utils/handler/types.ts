import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { PlanningFacade, PlanningScope, PlanningService } from '@owlmeans/planning'
import type { PlanningHandlerOptions } from '../../types.js'
import type { HandlerScope } from '../types.js'

/** The planning service of one context, as a request handler reaches it. */
export interface PlanningHandlerHelper {
  planningServiceOf: (opts?: Pick<PlanningHandlerOptions, 'service'>) => PlanningService
  /**
   * The facade a handler works through, and the access it was resolved under.
   *
   * Without `opts.access` it is exactly the request's scope plus what `opts.scope` derives. With it,
   * the resolver names the organization and the visible projects; a throw from the resolver is the
   * request's error.
   */
  handlerScopeOf: (req: AbstractRequest, opts?: PlanningHandlerOptions) => Promise<HandlerScope>
  /** The facade a handler works through: the request's scope plus what `opts.scope` derives. */
  handlerFacade: (req: AbstractRequest, opts?: PlanningHandlerOptions) => Promise<PlanningFacade>
  /**
   * The facade a hand-written handler works through: the request's entity and subject, plus `extra`
   * (a `channel`) — never an entity from the request body.
   *
   * @throws {AuthorizationError} when the request carries no organization
   */
  planningFor: (
    req: AbstractRequest, extra?: Partial<PlanningScope>, opts?: Pick<PlanningHandlerOptions, 'service'>
  ) => PlanningFacade
}
