import type { PlanningAliases, PlanningAliasHelper, PlanningDefinitionAliases } from './aliases/types.js'

export const createPlanningAliasHelper = (): PlanningAliasHelper => {
  const planningAliases = (base: string): PlanningAliases => Object.freeze({
    base,
    schema: Object.freeze({ list: `${base}:schema:list` }),
    card: Object.freeze({
      list: `${base}:card:list`,
      summary: `${base}:card:summary`,
      get: `${base}:card:get`,
      transitions: `${base}:card:transitions`,
      specifications: `${base}:card:specifications`,
    }),
    spec: Object.freeze({
      get: `${base}:specification:get`,
      revisions: `${base}:specification:revisions`,
    }),
    link: Object.freeze({ list: `${base}:link:list` }),
    transition: Object.freeze({ get: `${base}:transition:get` }),
    execute: `${base}:execute`,
    commit: Object.freeze({ get: `${base}:commit:get`, events: `${base}:commit:events` }),
  })

  const planningDefinitionAliases = (base: string): PlanningDefinitionAliases => Object.freeze({
    define: `${base}:schema:define`,
  })

  return { planningAliases, planningDefinitionAliases }
}

export const planningAliasHelper = createPlanningAliasHelper()
