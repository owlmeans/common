import type { PlanningFacade, PlanningScope, Workcard, WorkcardModel } from '@owlmeans/planning'
import type { PlanningStores } from '../types.js'

/** The planning client of one context, without the `WithPlanningClient` mixin type. */
export interface PlanningContextHelper {
  /** The facade of the context's planning client — `context.planning().for(scope)`. */
  facade: (scope?: Partial<PlanningScope>) => PlanningFacade
  /**
   * The model of a card (read by id when given one), with the schema bundle loaded first so `can()` and
   * `available()` answer from real flows. Built by `@owlmeans/planning`'s `modelOf(record, facade)`.
   */
  model: <R extends Workcard = Workcard>(card: R | string, scope?: Partial<PlanningScope>) => Promise<WorkcardModel<R>>
  /** The stores `appendPlanningStores` registered, or `null` on a context that has none. */
  stores: () => PlanningStores | null
}
