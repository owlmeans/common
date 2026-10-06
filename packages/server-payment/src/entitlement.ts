import { createService } from '@owlmeans/context'
import { INTERNAL_PAYGATE, SubscriptionStatus, entitlementViewHelper, planLimitHelper } from '@owlmeans/payment'
import type { EntitlementPlanView, EntitlementView, LimitUsage } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { ENTITLEMENT_SERVICE } from './consts.js'
import type { EffectivePlan, EntitlementService } from './types.js'
import { paymentAccessOf } from './access.js'
import { paymentUtils } from './utils.js'
import { catalogueOf } from './catalogue.js'
import { planHelper } from './plan.js'
import { usageOf } from './usage.js'

const dateOrUndefined = (value: Date | null | undefined): Date | undefined =>
  value == null ? undefined : new Date(value)

/** The plan half of an entitlement view. `subscribedAt` is what a grandfathered promo is measured against. */
const planViewOf = (effective: EffectivePlan): EntitlementPlanView => {
  const { plan, subscription, fallback } = effective
  const status = subscription?.status ?? SubscriptionStatus.Active

  return paymentUtils.compact<EntitlementPlanView>({
    sku: plan.sku,
    productSku: plan.productSku,
    title: plan.title,
    rank: planHelper.planRank(plan),
    free: plan.free === true,
    status,
    paygate: subscription?.paygate ?? INTERNAL_PAYGATE,
    subscriptionId: subscription?.externalId ?? undefined,
    subscribedAt: dateOrUndefined(subscription?.createdAt),
    periodStart: dateOrUndefined(subscription?.periodStart),
    periodEnd: dateOrUndefined(subscription?.periodEnd),
    cancelAtPeriodEnd: subscription?.cancelAtPeriodEnd ?? undefined,
    trialEnd: dateOrUndefined(subscription?.trialEnd),
    pausedAt: dateOrUndefined(subscription?.pausedAt),
    pastDue: status === SubscriptionStatus.PastDue,
    fallbackSku: plan.free !== true ? fallback?.sku : undefined,
  })
}

/** Plan resolution, the entitlement view and the usage ledger — Mongo only, never the paygate. */
export const makeEntitlementService = (alias: string = ENTITLEMENT_SERVICE): EntitlementService => {
  // What an entity may do now: its effective plan, every capability and every limit with its usage.
  const entitlementViewFor = async (entityId: string): Promise<EntitlementView> => {
    const ctx = ctxOf()
    const at = new Date()
    const effective = await catalogueOf(ctx).resolveEffectivePlan(entityId, at)
    const declared = Object.entries(effective.plan.limits ?? {})
    const windows = new Map(declared.map(([key, declaration]) => [
      key, planLimitHelper.windowKeyOf(declaration.kind, declaration.window, at),
    ]))
    const usage: LimitUsage[] = []
    if (declared.length > 0) {
      const { items } = await paymentAccessOf(ctx).usageCounters().list({
        entityId, limitKey: [...windows.keys()], window: [...new Set(windows.values())],
      }, { size: 0 })
      for (const counter of items) {
        if (windows.get(counter.limitKey) === counter.window) {
          usage.push({ key: counter.limitKey, window: counter.window, used: counter.used })
        }
      }
    }

    return entitlementViewHelper.entitlementViewOf(effective.plan, planViewOf(effective), usage, at)
  }

  const service: EntitlementService = createService<EntitlementService>(alias, {
    effectivePlan: async entityId => await catalogueOf(ctxOf()).resolveEffectivePlan(entityId),
    entitlements: async entityId => await entitlementViewFor(entityId),
    hasCapability: async (entityId, param) => planLimitHelper.capabilityOf(await entitlementViewFor(entityId), param),
    limitState: async (entityId, key) => await usageOf(ctxOf()).limitStateOf(entityId, key),
    consume: async req => await usageOf(ctxOf()).consumeLimit(req),
    release: async req => await usageOf(ctxOf()).releaseLimit(req),
    reconcileOccupancy: async (entityId, limitKey, actual) =>
      await usageOf(ctxOf()).reconcileOccupancyOf(entityId, limitKey, actual),
    reconcileCounters: async entityId => await usageOf(ctxOf()).reconcileLedgerCounters(entityId),
    consumption: async (entityId, limitKey, eventKey) =>
      await usageOf(ctxOf()).consumptionOf(entityId, limitKey, eventKey),
    consumptionByRef: async (entityId, limitKey, ref) =>
      await usageOf(ctxOf()).consumptionByRefOf(entityId, limitKey, ref),
  })
  const ctxOf = (): ApiContext => service.assertCtx() as unknown as ApiContext

  return service
}
