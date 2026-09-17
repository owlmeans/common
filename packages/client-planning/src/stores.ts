import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { Relationship, Workcard } from '@owlmeans/planning'
import type { Criteria } from '@owlmeans/resource'
import { appendStateResource } from '@owlmeans/state'
import type { StateResourceAppend } from '@owlmeans/state'
import { DEFAULT_STORE_ALIASES } from './consts.js'
import type { PlanningStoreAliases, PlanningStores, SyncOptions, WithPlanningStores } from './types.js'
import { idsOf, putCard, putLink } from './utils/record.js'

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

/** The stores `appendPlanningStores` registered, or `null` on a context that has none. */
export const planningStoresOf = (context: BasicContext<any>): PlanningStores | null => {
  const ctx = context as Partial<WithPlanningStores>

  return typeof ctx.planningStores === 'function' ? ctx.planningStores() : null
}

/**
 * Make the store agree with an authoritative list WITHIN a scope: every card given is written
 * (unless the store holds a newer fold of it), and every card matching `where` that the list does
 * not name is dropped. Cards outside `where` are left alone — which is why this, and never
 * `replace()`, is how a list reaches the one shared card store.
 *
 * Unchanged cards are not rewritten, so a periodic re-seed wakes no subscriber.
 */
export const syncCards = async (
  store: PlanningStores['cards'], items: Workcard[], where?: Criteria<Workcard>, opts?: SyncOptions
): Promise<void> => {
  await dropUnnamed(store, idsOf(items), where, opts)
  for (const item of items) {
    await putCard(store, item)
  }
}

/** {@link syncCards} for the link store. */
export const syncLinks = async (
  store: PlanningStores['links'], items: Relationship[], where?: Criteria<Relationship>, opts?: SyncOptions
): Promise<void> => {
  await dropUnnamed(store, idsOf(items), where, opts)
  for (const item of items) {
    await putLink(store, item)
  }
}

const dropUnnamed = async <T extends Workcard | Relationship>(
  store: PlanningStores['cards'] | PlanningStores['links'], named: string[], where?: Criteria<T>, opts?: SyncOptions
): Promise<void> => {
  const keep = new Set([...named, ...(opts?.keep ?? [])])
  const scoped = await (store as PlanningStores['cards']).list(where as Criteria<Workcard>)
  const stale = idsOf(scoped.items).filter(id => !keep.has(id))
  if (stale.length > 0) {
    await store.purge({ id: { $in: stale } })
  }
}
