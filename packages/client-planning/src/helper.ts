import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { PLANNING_SERVICE } from '@owlmeans/planning'
import type { PlanningFacade, PlanningScope, Workcard, WorkcardModel } from '@owlmeans/planning'
import type { PlanningClientService } from './types.js'

/** The facade of the context's planning client — `context.planning().for(scope)` without the mixin type. */
export const planningOf = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, scope?: Partial<PlanningScope>
): PlanningFacade => context.service<PlanningClientService>(PLANNING_SERVICE).for(scope)

/**
 * The model of a card (read by id when given one), with the schema bundle loaded first so `can()` and
 * `available()` answer from real flows. Named apart from `@owlmeans/planning`'s `modelOf(record,
 * facade)`, which it calls.
 */
export const planningModelOf = async <R extends Workcard = Workcard, C extends BasicConfig = BasicConfig, T extends BasicContext<C> = BasicContext<C>>(
  context: T, card: R | string, scope?: Partial<PlanningScope>
): Promise<WorkcardModel<R>> => await planningOf<C, T>(context, scope).model<R>(card)
