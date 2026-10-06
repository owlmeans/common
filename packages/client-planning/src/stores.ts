import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { Relationship, Workcard } from '@owlmeans/planning'
import type { Criteria } from '@owlmeans/resource'
import { appendStateResource, type StateResourceAppend } from '@owlmeans/state'
import { DEFAULT_STORE_ALIASES } from './consts.js'
import { planningContextOf } from './helper.js'
import { syncHelper } from './sync.js'
import type { PlanningStoreAliases, PlanningStores, SyncOptions, WithPlanningStores } from './types.js'

/**
 * Register the planning state mirror: ONE card store for every kind, a link store and a commit
 * store, and `context.planningStores()`.
 *
 * Projects, cards and specifications share one id space, so they share one store — a store per
 * kind would let a card list that reloads drop the projects beside it, and would give a record two
 * homes the moment its kind is read wrong. Idempotent, like every `append*`.
 */
export const appendPlanningStores = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T, aliases?: Partial<PlanningStoreAliases>
): T & WithPlanningStores & StateResourceAppend => {
  const names: PlanningStoreAliases = { ...DEFAULT_STORE_ALIASES, ...aliases }
  let ctx = appendStateResource<C, T, Workcard>(context, names.cards)
  ctx = appendStateResource<C, typeof ctx, Relationship>(ctx, names.links)
  ctx = appendStateResource<C, typeof ctx>(ctx, names.commits)

  const result = ctx as T & WithPlanningStores & StateResourceAppend
  if (result.planningStores == null) {
    result.planningStores = () => ({
      cards: result.getStateResource(names.cards),
      links: result.getStateResource(names.links),
      commits: result.getStateResource(names.commits),
    })
  }

  return result
}


/** @deprecated compat:factory-refactor — use `planningContextOf(context).stores()` */
export const planningStoresOf = (context: BasicContext<any>): PlanningStores | null => planningContextOf(context).stores()

/** @deprecated compat:factory-refactor — use `syncHelper.syncCards(…)` */
export const syncCards = async (
  store: PlanningStores['cards'], items: Workcard[], where?: Criteria<Workcard>, opts?: SyncOptions
): Promise<void> => await syncHelper.syncCards(store, items, where, opts)

/** @deprecated compat:factory-refactor — use `syncHelper.syncLinks(…)` */
export const syncLinks = async (
  store: PlanningStores['links'], items: Relationship[], where?: Criteria<Relationship>, opts?: SyncOptions
): Promise<void> => await syncHelper.syncLinks(store, items, where, opts)
