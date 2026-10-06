import { memoHelper, type BasicConfig, type BasicContext } from '@owlmeans/context'
import { PLANNING_SERVICE } from '@owlmeans/planning'
import type { PlanningFacade, PlanningScope, Workcard, WorkcardModel } from '@owlmeans/planning'
import type { PlanningContextHelper } from './helper/types.js'
import type { PlanningClientService, PlanningStores, WithPlanningStores } from './types.js'

export const makePlanningContextHelper = (context: BasicContext<BasicConfig>): PlanningContextHelper => {
  const facade = (scope?: Partial<PlanningScope>): PlanningFacade =>
    context.service<PlanningClientService>(PLANNING_SERVICE).for(scope)

  const model = async <R extends Workcard = Workcard>(
    card: R | string, scope?: Partial<PlanningScope>
  ): Promise<WorkcardModel<R>> => await facade(scope).model<R>(card)

  const stores = (): PlanningStores | null => {
    const ctx = context as Partial<WithPlanningStores>

    return typeof ctx.planningStores === 'function' ? ctx.planningStores() : null
  }

  return { facade, model, stores }
}

/** The planning helper of a context — one per context. */
export const planningContextOf = memoHelper.oncePer(makePlanningContextHelper)

/** @deprecated compat:factory-refactor — use `planningContextOf(context).facade(…)` */
export const planningOf = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, scope?: Partial<PlanningScope>
): PlanningFacade => planningContextOf(context).facade(scope)

/** @deprecated compat:factory-refactor — use `planningContextOf(context).model(…)` */
export const planningModelOf = async <R extends Workcard = Workcard, C extends BasicConfig = BasicConfig, T extends BasicContext<C> = BasicContext<C>>(
  context: T, card: R | string, scope?: Partial<PlanningScope>
): Promise<WorkcardModel<R>> => await planningContextOf(context).model<R>(card, scope)
