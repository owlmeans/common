import type { PlanningFacade } from '@owlmeans/planning'
import type { PlanningAccess } from '../types.js'

export interface HandlerScope {
  facade: PlanningFacade
  /** The resolver's answer, when the handler options carry one. */
  access?: PlanningAccess
}
