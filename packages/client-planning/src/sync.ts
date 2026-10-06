import type { Relationship, Workcard } from '@owlmeans/planning'
import type { Criteria } from '@owlmeans/resource'
import type { SyncHelper } from './sync/types.js'
import type { PlanningStores, SyncOptions } from './types.js'
import { recordUtils } from './utils/record.js'

export const createSyncHelper = (): SyncHelper => {
  const syncCards = async (
    store: PlanningStores['cards'], items: Workcard[], where?: Criteria<Workcard>, opts?: SyncOptions
  ): Promise<void> => {
    await dropUnnamed(store, recordUtils.idsOf(items), where, opts)
    for (const item of items) {
      await recordUtils.putCard(store, item)
    }
  }

  const syncLinks = async (
    store: PlanningStores['links'], items: Relationship[], where?: Criteria<Relationship>, opts?: SyncOptions
  ): Promise<void> => {
    await dropUnnamed(store, recordUtils.idsOf(items), where, opts)
    for (const item of items) {
      await recordUtils.putLink(store, item)
    }
  }

  const dropUnnamed = async <T extends Workcard | Relationship>(
    store: PlanningStores['cards'] | PlanningStores['links'], named: string[], where?: Criteria<T>, opts?: SyncOptions
  ): Promise<void> => {
    const keep = new Set([...named, ...(opts?.keep ?? [])])
    const scoped = await (store as PlanningStores['cards']).list(where as Criteria<Workcard>)
    const stale = recordUtils.idsOf(scoped.items).filter(id => !keep.has(id))
    if (stale.length > 0) {
      await store.purge({ id: { $in: stale } })
    }
  }

  return { syncCards, syncLinks }
}

export const syncHelper = createSyncHelper()
