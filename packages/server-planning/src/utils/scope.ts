import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { PlanningFacade, PlanningScope, PlanningService, TransitionActor, Workcard } from '@owlmeans/planning'
import type { PlanningAccess, PlanningAccessGrants, PlanningHandlerOptions } from '../types.js'
import { makePlanningAccessModel } from './access.js'
import { planningHandlerOf } from './handler.js'
import { makeRequestScope } from './request.js'
import type { HandlerScope } from './types.js'

/** @deprecated compat:factory-refactor — use `makeRequestScope(req).actorOf()` */
export const actorOf = (req: AbstractRequest): TransitionActor => makeRequestScope(req).actorOf()

/** @deprecated compat:factory-refactor — use `makeRequestScope(req).scopeOf(…)` */
export const scopeOf = (req: AbstractRequest, extra?: Partial<PlanningScope>): PlanningScope =>
  makeRequestScope(req).scopeOf(extra)

/** @deprecated compat:factory-refactor — use `makeRequestScope(req).accessScopeOf(…)` */
export const accessScopeOf = (
  req: AbstractRequest, access: PlanningAccess, extra?: Partial<PlanningScope>
): PlanningScope => makeRequestScope(req).accessScopeOf(access, extra)

/** @deprecated compat:factory-refactor — use `planningHandlerOf(ctx).planningServiceOf(…)` */
export const planningServiceOf = (
  ctx: BasicContext<BasicConfig>, opts?: Pick<PlanningHandlerOptions, 'service'>
): PlanningService => planningHandlerOf(ctx).planningServiceOf(opts)

/** @deprecated compat:factory-refactor — use `planningHandlerOf(ctx).handlerScopeOf(…)` */
export const handlerScopeOf = async (
  ctx: BasicContext<BasicConfig>, req: AbstractRequest, opts?: PlanningHandlerOptions
): Promise<HandlerScope> => await planningHandlerOf(ctx).handlerScopeOf(req, opts)

/** @deprecated compat:factory-refactor — use `planningHandlerOf(ctx).handlerFacade(…)` */
export const handlerFacade = async (
  ctx: BasicContext<BasicConfig>, req: AbstractRequest, opts?: PlanningHandlerOptions
): Promise<PlanningFacade> => await planningHandlerOf(ctx).handlerFacade(req, opts)

/** @deprecated compat:factory-refactor — use `makePlanningAccessModel(access).assertGranted(…)` */
export const assertGranted = (
  access: PlanningAccess | undefined, grant: keyof PlanningAccessGrants, target?: string
): void => makePlanningAccessModel(access).assertGranted(grant, target)

/** @deprecated compat:factory-refactor — use `makePlanningAccessModel(access).writableIn(…)` */
export const writableIn = (access: PlanningAccess | undefined, card: Pick<Workcard, 'id' | 'parents'>): boolean =>
  makePlanningAccessModel(access).writableIn(card)

/** @deprecated compat:factory-refactor — use `makePlanningAccessModel(access).assertWrites(…)` */
export const assertWrites = (access: PlanningAccess | undefined, target?: string): void =>
  makePlanningAccessModel(access).assertWrites(target)
