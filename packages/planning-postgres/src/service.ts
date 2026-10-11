import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { WithPlanningService } from '@owlmeans/planning'
import { DEFAULT_ALIAS, makePlanningService } from '@owlmeans/server-planning'
import type { PlanningHostService } from '@owlmeans/server-planning'
import { makePlanningPostgresResources } from './resource.js'
import { makePostgresPlanningStore, planningPostgresAliases } from './store/index.js'
import type { PostgresPlanningServiceOptions } from './types.js'

/**
 * The planning service over a Postgres store — what a target's own `services/planning.ts`
 * exports as its `makeService()`. The store resolves its four resources on the service's context
 * at the first call, so the resources are registered separately (`resources/planning/*.ts`).
 */
export const makePostgresPlanningService = (
  opts: PostgresPlanningServiceOptions = {}, alias: string = DEFAULT_ALIAS
): PlanningHostService => {
  const { aliases, bus, limits, ...service } = opts
  let host: PlanningHostService | undefined
  const store = makePostgresPlanningStore({
    aliases, bus, limits, ids: opts.ids, now: opts.now,
    context: () => host?.ctx as BasicContext<any> | undefined,
  })
  host = makePlanningService({ ...service, store }, alias)

  return host
}

/**
 * Register the four Postgres resources (each unless the context already has it), the planning
 * service over them, and `context.planning()` — the one-call wiring of a hand-written backend.
 */
export const appendPostgresPlanning = <C extends BasicConfig, T extends BasicContext<C>>(
  ctx: T, opts: PostgresPlanningServiceOptions = {}, alias: string = DEFAULT_ALIAS
): T & WithPlanningService => {
  const context = ctx as T & WithPlanningService
  for (const resource of makePlanningPostgresResources(planningPostgresAliases(opts.aliases))) {
    if (!context.hasResource(resource.alias)) {
      context.registerResource(resource)
    }
  }
  context.registerService(makePostgresPlanningService(opts, alias))
  context.planning = () => context.service<PlanningHostService>(alias)

  return context
}
