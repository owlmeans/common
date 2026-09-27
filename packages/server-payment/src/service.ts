import type Stripe from 'stripe'
import { createService } from '@owlmeans/context'
import {
  appendPaymentService, DEFAULT_ALIAS as PAYMENT_SERVICE, ENTITLEMENT_GATE, INTERNAL_PAYGATE, LIMIT_GATE,
  PaygateError, ProductError, SubscriptionStatus, UnknownPlan,
} from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { assertPlanDeclarations } from './config.js'
import {
  ENTITLEMENT_SERVICE, GATEWAY_SERVICE, RES_PAYGATE_CUSTOMER, RES_PAYMENT_FINGERPRINT, RES_PAYMENT_FULFILLMENT,
  RES_PAYMENT_SUBSCRIPTION, RES_PAYMENT_USAGE, RES_PAYMENT_USAGE_COUNTER, RES_PAYMENT_WEBHOOK,
} from './consts.js'
import { registerConsumerRights } from './consumer/service.js'
import { makeEntitlementService } from './entitlement.js'
import { makeCapabilityGate } from './gate.js'
import { makeLimitGate } from './limit.js'
import { appendCompletionObserver } from './observer.js'
import { findPlan, findProduct, planRank } from './plan.js'
import { resyncStripeSubscription, resyncStripeSubscriptions } from './plugins/events.js'
import { makeEstimateCache, estimateStripePrice } from './plugins/estimate.js'
import { createPortalLink, ensurePortalConfiguration } from './plugins/portal.js'
import { makeCheckoutPluginRegistry, narrowAmountFor } from './plugins/checkout-plugins.js'
import { consumablePlanOf, createCheckoutLink } from './plugins/stripe.js'
import { ensureWebhookEndpoint } from './plugins/webhook-manager.js'
import {
  makeFingerprintResource, makeFulfillmentResource, makePaygateCustomerResource, makeSubscriptionResource,
  makeUsageCounterResource, makeUsageResource, makeWebhookResource,
} from './resource.js'
import { commitSubscription } from './subscription.js'
import { syncedPlanPrices, syncStripeProducts } from './sync.js'
import { consumerRightsOf, stripeClient, subscriptions } from './utils.js'
import type {
  Config, Context, GatewayService, GrantInternalPlanOptions, PaymentGatewayOptions, PaymentPlan,
  PaymentSubscriptionRecord,
} from './types.js'

export interface StripeBootstrapOptions {
  /** Re-verify what the stored fingerprints say is in place. */
  force?: boolean
}

/**
 * Bring Stripe to what this deployment declares, each step on its own so one failing does not block
 * the others: products and prices, the customer-portal configuration, the webhook endpoint.
 */
export const bootstrapStripe = async (
  ctx: ApiContext, stripe: Stripe, opts: StripeBootstrapOptions = {},
): Promise<void> => {
  const steps: Array<[string, () => Promise<unknown>]> = [
    ['products', async () => await syncStripeProducts(ctx, stripe)],
    ['portal', async () => await ensurePortalConfiguration(ctx, stripe, opts)],
    ['webhook', async () => await ensureWebhookEndpoint(ctx, stripe, opts)],
  ]
  for (const [name, step] of steps) {
    try {
      await step()
    } catch (error) {
      console.error(`[payment] Stripe ${name} bootstrap failed`, error)
    }
  }
}

/**
 * Grant a plan without a paygate — the free plan every entity holds, or a complimentary one
 * (`force`). One row per grant (`free:<entityId>` / `internal:<planSku>:<entityId>`), upserted: its
 * `createdAt` survives a re-grant, and observers hear `created` once.
 */
export const grantInternalPlan = async (
  ctx: ApiContext, entityId: string, planSku: string, opts: GrantInternalPlanOptions = {},
): Promise<PaymentSubscriptionRecord> => {
  const plan = await findPlan(ctx, planSku)
  if (plan == null) {
    throw new UnknownPlan(planSku)
  }
  if (plan.free !== true && opts.force !== true) {
    throw new ProductError(`internal-grant:${planSku}`)
  }
  const product = await findProduct(ctx, plan.productSku)
  const externalId = plan.free === true ? `free:${entityId}` : `internal:${planSku}:${entityId}`
  const previous = await subscriptions(ctx).byExternalId(externalId, INTERNAL_PAYGATE)
  const now = new Date()
  const { periodEnd: _periodEnd, endedAt: _endedAt, canceledAt: _canceledAt, ...kept } = previous ?? {}

  const next = {
    ...kept,
    entityId,
    planSku,
    productSku: plan.productSku,
    service: previous?.service ?? product?.services?.[0] ?? ctx.cfg.service,
    paygate: INTERNAL_PAYGATE,
    externalId,
    status: SubscriptionStatus.Active,
    rank: planRank(plan),
    ...(opts.periodEnd != null ? { periodEnd: opts.periodEnd } : {}),
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
  } as PaymentSubscriptionRecord
  const { record } = await commitSubscription(ctx, previous, next)

  return record ?? next
}

const unmanaged = (): never => { throw new PaygateError('unmanaged') }

export const makeGatewayService = (
  alias: string = GATEWAY_SERVICE, opts: Pick<PaymentGatewayOptions, 'manage'> = {},
): GatewayService => {
  const managed = opts.manage !== false
  // One estimate cache per gateway SERVICE instance, never module-level: several service
  // instances (several tests, several deployments in one process) must never share hits.
  const estimateCache = makeEstimateCache()
  // Checkout plugins are seated per gateway instance, like the estimate cache.
  const plugins = makeCheckoutPluginRegistry()
  const service = createService<GatewayService>(alias, {
    managed,
    createLink: async (ctx, params) => managed
      ? await createCheckoutLink(ctx, await stripeClient(ctx), params, plugins.list()) : unmanaged(),
    use: plugin => { plugins.use(plugin) },
    checkoutPlugins: () => plugins.list(),
    amountPolicy: async (ctx, entityId, productSku, planSku) => {
      const { plan } = await consumablePlanOf(ctx, productSku, planSku)
      if (plan.amountPolicy == null) throw new ProductError(`amount-policy:${plan.sku}`)
      return await narrowAmountFor(ctx, plugins.list(), {
        entityId, productSku, planSku: (plan as PaymentPlan).sku, base: plan.amountPolicy, at: new Date(),
      })
    },
    planPrices: async (ctx, productSku) => await syncedPlanPrices(ctx, productSku),
    portalLink: async (ctx, entityId, link) => managed
      ? await createPortalLink(ctx, await stripeClient(ctx), entityId, link) : unmanaged(),
    grantInternalPlan: async (ctx, entityId, planSku, grant) => await grantInternalPlan(ctx, entityId, planSku, grant),
    resyncSubscription: async (ctx, ref) => managed
      ? await resyncStripeSubscription(ctx, await stripeClient(ctx), ref) : unmanaged(),
    resyncAll: async ctx => managed
      ? await resyncStripeSubscriptions(ctx, await stripeClient(ctx)) : unmanaged(),
    estimatePrice: async (ctx, params) => managed
      ? await estimateStripePrice(ctx, await stripeClient(ctx), params, estimateCache) : unmanaged(),
  }, service => async () => {
    const ctx = service.assertCtx() as unknown as ApiContext
    assertPlanDeclarations(ctx.cfg)
    service.initialized = true
    // The consumer-rights service is lazy (reachable while the application is wired): initialize it
    // with the gateway, so its boot checks run at boot.
    consumerRightsOf(ctx)
    if (managed) {
      void ctx.waitForInitialized().then(async () => {
        await bootstrapStripe(ctx, await stripeClient(ctx))
      }).catch(error => { console.error('[payment] Stripe bootstrap failed', error) })
    }
  })

  return service
}

/**
 * Register the payment resources, the catalogue service, the completion observer, the gateway, both
 * gate services, the entitlement service and the consumer-rights records and service — each only
 * when not registered yet.
 *
 * `manage: false` registers the same surface for a process that reads entitlements but never talks
 * to Stripe.
 */
export const appendPaymentGatewayService = <C extends Config, T extends Context<C>>(
  ctx: T, opts?: PaymentGatewayOptions,
): T => {
  const makers = [
    [RES_PAYGATE_CUSTOMER, makePaygateCustomerResource],
    [RES_PAYMENT_SUBSCRIPTION, makeSubscriptionResource],
    [RES_PAYMENT_FULFILLMENT, makeFulfillmentResource],
    [RES_PAYMENT_WEBHOOK, makeWebhookResource],
    [RES_PAYMENT_USAGE, makeUsageResource],
    [RES_PAYMENT_USAGE_COUNTER, makeUsageCounterResource],
    [RES_PAYMENT_FINGERPRINT, makeFingerprintResource],
  ] as const
  for (const [alias, maker] of makers) {
    if (!ctx.hasResource(alias)) {
      ctx.registerResource(maker(opts?.dbAlias, opts?.serviceAlias) as never)
    }
  }
  if (!ctx.hasService(PAYMENT_SERVICE)) appendPaymentService(ctx as never)
  appendCompletionObserver(ctx)
  if (!ctx.hasService(GATEWAY_SERVICE)) ctx.registerService(makeGatewayService(GATEWAY_SERVICE, { manage: opts?.manage }))
  if (!ctx.hasService(ENTITLEMENT_GATE)) ctx.registerService(makeCapabilityGate())
  if (!ctx.hasService(LIMIT_GATE)) ctx.registerService(makeLimitGate())
  if (!ctx.hasService(ENTITLEMENT_SERVICE)) ctx.registerService(makeEntitlementService())
  // The consumer-rights records and service, with this gateway's `manage` unless the application
  // gave its own (before or after this call): the webhook writes purchases and locks, and an
  // unmanaged process still reads and asserts consent.
  registerConsumerRights(ctx, { manage: opts?.manage, dbAlias: opts?.dbAlias, serviceAlias: opts?.serviceAlias }, 'gateway')

  return ctx
}
