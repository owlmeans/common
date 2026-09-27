import { PlanRequired } from '@owlmeans/payment'
import type { EntitlementView } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { entitlements, gateway, subscriptions, usageEvents } from './utils.js'
import type { ReconcileAllOptions, ReconcileAllResult, ReconcileEntityOptions } from './types.js'

/** Grant the free plan when the entity holds no entitling subscription. @returns whether it granted */
const backfillFreePlan = async (ctx: ApiContext, entityId: string, freePlanSku: string): Promise<boolean> => {
  try {
    const { subscription } = await entitlements(ctx).effectivePlan(entityId)
    if (subscription != null) {
      return false
    }
  } catch (error) {
    if (!(error instanceof PlanRequired)) {
      throw error
    }
  }
  await gateway(ctx).grantInternalPlan(ctx, entityId, freePlanSku)

  return true
}

const resyncEntity = async (ctx: ApiContext, entityId: string): Promise<void> => {
  const service = gateway(ctx)
  if (!service.managed) {
    return
  }
  try {
    await service.resyncSubscription(ctx, { entityId })
  } catch (error) {
    console.error(`[payment] reconcile: resync of "${entityId}" failed`, error)
  }
}

/**
 * Repair one entity: optionally re-read its paygate subscriptions, grant the free plan when it holds
 * nothing entitling, recompute its limit counters from the ledger, and return its view.
 */
export const reconcileEntity = async (
  ctx: ApiContext, entityId: string, opts: ReconcileEntityOptions = {},
): Promise<EntitlementView> => {
  if (opts.resync === true) {
    await resyncEntity(ctx, entityId)
  }
  if (opts.freePlanSku != null) {
    await backfillFreePlan(ctx, entityId, opts.freePlanSku)
  }
  await entitlements(ctx).reconcileCounters(entityId)

  return await entitlements(ctx).entitlements(entityId)
}

type Distinct = { collection: { distinct: (field: string, filter: object) => Promise<unknown[]> } }

const knownEntities = async (ctx: ApiContext): Promise<Set<string>> => {
  const ids = new Set<string>()
  for (const resource of [subscriptions(ctx), usageEvents(ctx)] as unknown as Distinct[]) {
    for (const id of await resource.collection.distinct('entityId', {})) {
      if (typeof id === 'string' && id !== '') {
        ids.add(id)
      }
    }
  }

  return ids
}

/**
 * Repair every entity the payment store knows, plus `entities`: counters from the ledger in one
 * pass, then per entity the optional resync and the free-plan backfill. A failing entity is counted
 * and logged, never fatal.
 */
export const reconcileAll = async (
  ctx: ApiContext, opts: ReconcileAllOptions = {},
): Promise<ReconcileAllResult> => {
  const ids = await knownEntities(ctx)
  if (opts.entities != null) {
    for await (const id of opts.entities) {
      ids.add(id)
    }
  }

  const result: ReconcileAllResult = { entities: ids.size, granted: 0, counters: 0, repaired: 0, failed: 0 }
  for (const entityId of ids) {
    try {
      if (opts.resync === true) {
        await resyncEntity(ctx, entityId)
      }
      if (opts.freePlanSku != null && await backfillFreePlan(ctx, entityId, opts.freePlanSku)) {
        result.granted++
      }
      const counters = await entitlements(ctx).reconcileCounters(entityId)
      result.counters += counters.counters
      result.repaired += counters.repaired
    } catch (error) {
      result.failed++
      console.error(`[payment] reconcile of "${entityId}" failed`, error)
    }
  }

  return result
}
