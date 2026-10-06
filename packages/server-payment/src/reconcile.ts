import { PlanRequired, type EntitlementView } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { ReconcileAllOptions, ReconcileAllResult, ReconcileEntityOptions } from './types.js'
import { log } from './log.js'
import type { Distinct } from './types.local.js'
import { paymentAccessOf } from './access.js'
import type { ReconcileHelper } from './reconcile/types.js'

export const makeReconcileHelper = (ctx: ApiContext): ReconcileHelper => {
  const access = paymentAccessOf(ctx)

  /** Grant the free plan when the entity holds no entitling subscription. @returns whether it granted */
  const backfillFreePlan = async (entityId: string, freePlanSku: string): Promise<boolean> => {
    try {
      const { subscription } = await access.entitlements().effectivePlan(entityId)
      if (subscription != null) {
        return false
      }
    } catch (error) {
      if (!(error instanceof PlanRequired)) {
        throw error
      }
    }
    await access.gateway().grantInternalPlan(ctx, entityId, freePlanSku)

    return true
  }

  const resyncEntity = async (entityId: string): Promise<void> => {
    const service = access.gateway()
    if (!service.managed) {
      return
    }
    try {
      await service.resyncSubscription(ctx, { entityId })
    } catch (error) {
      log.error('Reconcile: subscription resync failed', { entityId, error })
    }
  }

  const reconcileEntity = async (entityId: string, opts: ReconcileEntityOptions = {}): Promise<EntitlementView> => {
    if (opts.resync === true) {
      await resyncEntity(entityId)
    }
    if (opts.freePlanSku != null) {
      await backfillFreePlan(entityId, opts.freePlanSku)
    }
    await access.entitlements().reconcileCounters(entityId)

    return await access.entitlements().entitlements(entityId)
  }

  const knownEntities = async (): Promise<Set<string>> => {
    const ids = new Set<string>()
    for (const resource of [access.subscriptions(), access.usageEvents()] as unknown as Distinct[]) {
      for (const id of await resource.collection.distinct('entityId', {})) {
        if (typeof id === 'string' && id !== '') {
          ids.add(id)
        }
      }
    }

    return ids
  }

  const reconcileAll = async (opts: ReconcileAllOptions = {}): Promise<ReconcileAllResult> => {
    const ids = await knownEntities()
    if (opts.entities != null) {
      for await (const id of opts.entities) {
        ids.add(id)
      }
    }

    const result: ReconcileAllResult = { entities: ids.size, granted: 0, counters: 0, repaired: 0, failed: 0 }
    for (const entityId of ids) {
      try {
        if (opts.resync === true) {
          await resyncEntity(entityId)
        }
        if (opts.freePlanSku != null && await backfillFreePlan(entityId, opts.freePlanSku)) {
          result.granted++
        }
        const counters = await access.entitlements().reconcileCounters(entityId)
        result.counters += counters.counters
        result.repaired += counters.repaired
      } catch (error) {
        result.failed++
        log.error('Reconcile of an entity failed', { entityId, error })
      }
    }

    return result
  }

  return { reconcileEntity, reconcileAll }
}

/** The entitlement repair of a context — one per context. */
export const reconcileOf = memoHelper.oncePer(makeReconcileHelper)

/** @deprecated compat:factory-refactor — use `reconcileOf(ctx).reconcileEntity(…)` */
export const reconcileEntity = async (
  ctx: ApiContext, entityId: string, opts: ReconcileEntityOptions = {},
): Promise<EntitlementView> => await reconcileOf(ctx).reconcileEntity(entityId, opts)

/** @deprecated compat:factory-refactor — use `reconcileOf(ctx).reconcileAll(…)` */
export const reconcileAll = async (
  ctx: ApiContext, opts: ReconcileAllOptions = {},
): Promise<ReconcileAllResult> => await reconcileOf(ctx).reconcileAll(opts)
