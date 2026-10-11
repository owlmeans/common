import { planningAliasHelper } from './aliases.js'
import type { PlanningAliases, PlanningDefinitionAliases } from './aliases/types.js'

/** @deprecated compat:factory-refactor — use `planningAliasHelper.planningAliases(…)` */
export const planningAliases = (base: string): PlanningAliases => planningAliasHelper.planningAliases(base)

/** @deprecated compat:factory-refactor — use `planningAliasHelper.planningDefinitionAliases(…)` */
export const planningDefinitionAliases = (base: string): PlanningDefinitionAliases =>
  planningAliasHelper.planningDefinitionAliases(base)
