import type { PlanningAliases, PlanningAliasHelper, PlanningDefinitionAliases, PlanningResourceAliases } from './aliases/types.js'

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

  const planningResourceAliases = (base: string): PlanningResourceAliases => Object.freeze(Object.fromEntries(
    ['assignees', 'teams', 'comments', 'mentions'].map(name => [name, Object.freeze({ get: `${base}:${name}:get`, list: `${base}:${name}:list`, write: `${base}:${name}:write` })])
  )) as unknown as PlanningResourceAliases
  return { planningAliases, planningDefinitionAliases, planningResourceAliases }
}

export const planningAliasHelper = createPlanningAliasHelper()
