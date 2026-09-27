import { createService } from '@owlmeans/context'
import {
  capabilityOf, entitlementViewOf, INTERNAL_PAYGATE, SubscriptionStatus, windowKeyOf,
} from '@owlmeans/payment'
import type { EntitlementPlanView, EntitlementView, LimitUsage } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { ENTITLEMENT_SERVICE } from './consts.js'
import { planRank, resolveEffectivePlan } from './plan.js'
import {
  consumeLimit, consumptionByRefOf, consumptionOf, limitStateOf, reconcileLedgerCounters, reconcileOccupancyOf, releaseLimit,
} from './usage.js'
import { compact, usageCounters } from './utils.js'
import type { EffectivePlan, EntitlementService } from './types.js'

const dateOrUndefined = (value: Date | null | undefined): Date | undefined =>
  value == null ? undefined : new Date(value)

/** The plan half of an entitlement view. `subscribedAt` is what a grandfathered promo is measured against. */
export const planViewOf = (effective: EffectivePlan): EntitlementPlanView => {
  const { plan, subscription, fallback } = effective
  const status = subscription?.status ?? SubscriptionStatus.Active

  return compact<EntitlementPlanView>({
    sku: plan.sku,
    productSku: plan.productSku,
    title: plan.title,
    rank: planRank(plan),
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

/** What an entity may do now: its effective plan, every capability and every limit with its usage. */
export const entitlementViewFor = async (ctx: ApiContext, entityId: string): Promise<EntitlementView> => {
  const at = new Date()
  const effective = await resolveEffectivePlan(ctx, entityId, at)
  const declared = Object.entries(effective.plan.limits ?? {})
  const windows = new Map(declared.map(([key, declaration]) => [
    key, windowKeyOf(declaration.kind, declaration.window, at),
  ]))
  const usage: LimitUsage[] = []
  if (declared.length > 0) {
    const { items } = await usageCounters(ctx).list({
      entityId, limitKey: [...windows.keys()], window: [...new Set(windows.values())],
    }, { size: 0 })
    for (const counter of items) {
      if (windows.get(counter.limitKey) === counter.window) {
        usage.push({ key: counter.limitKey, window: counter.window, used: counter.used })
      }
    }
  }

  return entitlementViewOf(effective.plan, planViewOf(effective), usage, at)
}

/** Plan resolution, the entitlement view and the usage ledger — Mongo only, never the paygate. */
export const makeEntitlementService = (alias: string = ENTITLEMENT_SERVICE): EntitlementService => {
  const service: EntitlementService = createService<EntitlementService>(alias, {
    effectivePlan: async entityId => await resolveEffectivePlan(ctxOf(), entityId),
    entitlements: async entityId => await entitlementViewFor(ctxOf(), entityId),
    hasCapability: async (entityId, param) => capabilityOf(await entitlementViewFor(ctxOf(), entityId), param),
    limitState: async (entityId, key) => await limitStateOf(ctxOf(), entityId, key),
    consume: async req => await consumeLimit(ctxOf(), req),
    release: async req => await releaseLimit(ctxOf(), req),
    reconcileOccupancy: async (entityId, limitKey, actual) =>
      await reconcileOccupancyOf(ctxOf(), entityId, limitKey, actual),
    reconcileCounters: async entityId => await reconcileLedgerCounters(ctxOf(), entityId),
    consumption: async (entityId, limitKey, eventKey) => await consumptionOf(ctxOf(), entityId, limitKey, eventKey),
    consumptionByRef: async (entityId, limitKey, ref) => await consumptionByRefOf(ctxOf(), entityId, limitKey, ref),
  })
  const ctxOf = (): ApiContext => service.assertCtx() as unknown as ApiContext

  return service
}
