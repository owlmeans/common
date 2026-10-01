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
import { ensureWebhookEndpoint, webhookRouteOf } from './plugins/webhook-manager.js'
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
 *
 * The webhook URL and the owner key come from the context's gateway (`webhookService`, `owner`), so
 * every process of one deployment — the one bootstrapping at boot, a `resync`, an application's
 * forced maintenance run — computes the same URL and rows; each step is fingerprinted, so running it
 * from any of them is idempotent.
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

/** The gateway options a service instance takes — the resource aliases belong to the registration. */
export type GatewayServiceOptions = Omit<PaymentGatewayOptions, 'dbAlias' | 'serviceAlias'>

/**
 * Refuse contradictory gateway options: `bootstrap: true` on an unmanaged gateway
 * (`PaygateError('bootstrap:unmanaged')`), an empty `owner` / `webhookService`
 * (`PaygateError('owner' | 'webhook-service')`).
 */
export const assertGatewayOptions = (opts: GatewayServiceOptions): void => {
  if (opts.manage === false && opts.bootstrap === true) {
    throw new PaygateError('bootstrap:unmanaged')
  }
  for (const [name, value] of [['owner', opts.owner], ['webhook-service', opts.webhookService]] as const) {
    if (value != null && (typeof value !== 'string' || value.trim() === '')) {
      throw new PaygateError(name)
    }
  }
}

/**
 * The gateway service. `manage`, `bootstrap`, `owner`, `webhookService` and `stripe` are
 * `PaymentGatewayOptions`; the options are checked here (`assertGatewayOptions`), and a managed,
 * bootstrapping gateway also refuses to initialize when its webhook service is not declared in
 * `cfg.services` (`WebhookSetupError('service:<alias>')`).
 */
export const makeGatewayService = (
  alias: string = GATEWAY_SERVICE, opts: GatewayServiceOptions = {},
): GatewayService => {
  assertGatewayOptions(opts)
  const managed = opts.manage !== false
  const bootstrap = opts.bootstrap ?? managed
  const stripeOf = opts.stripe ?? stripeClient
  // One estimate cache per gateway SERVICE instance, never module-level: several service
  // instances (several tests, several deployments in one process) must never share hits.
  const estimateCache = makeEstimateCache()
  // Checkout plugins are seated per gateway instance, like the estimate cache.
  const plugins = makeCheckoutPluginRegistry()
  const service: GatewayService = createService<GatewayService>(alias, {
    managed,
    bootstrap,
    get webhookService(): string {
      return opts.webhookService ?? (service.assertCtx() as unknown as ApiContext).cfg.service
    },
    get owner(): string {
      return opts.owner ?? (service.assertCtx() as unknown as ApiContext).cfg.service
    },
    stripe: stripeOf,
    createLink: async (ctx, params) => managed
      ? await createCheckoutLink(ctx, await stripeOf(ctx), params, plugins.list()) : unmanaged(),
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
      ? await createPortalLink(ctx, await stripeOf(ctx), entityId, link) : unmanaged(),
    grantInternalPlan: async (ctx, entityId, planSku, grant) => await grantInternalPlan(ctx, entityId, planSku, grant),
    resyncSubscription: async (ctx, ref) => managed
      ? await resyncStripeSubscription(ctx, await stripeOf(ctx), ref) : unmanaged(),
    resyncAll: async ctx => managed
      ? await resyncStripeSubscriptions(ctx, await stripeOf(ctx)) : unmanaged(),
    estimatePrice: async (ctx, params) => managed
      ? await estimateStripePrice(ctx, await stripeOf(ctx), params, estimateCache) : unmanaged(),
  }, service => async () => {
    const ctx = service.assertCtx() as unknown as ApiContext
    assertPlanDeclarations(ctx.cfg)
    if (bootstrap) {
      // Every boot bootstrap forms the webhook URL on this alias: an undeclared one fails the boot.
      webhookRouteOf(ctx, opts.webhookService ?? ctx.cfg.service)
    }
    service.initialized = true
    // The consumer-rights service is lazy (reachable while the application is wired): initialize it
    // with the gateway, so its boot checks run at boot.
    consumerRightsOf(ctx)
    if (bootstrap) {
      void ctx.waitForInitialized().then(async () => {
        await bootstrapStripe(ctx, await stripeOf(ctx))
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
 * to Stripe. Several managed processes of one deployment share the Stripe rows through one `owner`
 * and one `webhookService`; exactly one of them keeps `bootstrap` (the one receiving the webhook).
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
  if (!ctx.hasService(GATEWAY_SERVICE)) {
    ctx.registerService(makeGatewayService(GATEWAY_SERVICE, {
      manage: opts?.manage, bootstrap: opts?.bootstrap, owner: opts?.owner, webhookService: opts?.webhookService,
      stripe: opts?.stripe,
    }))
  }
  if (!ctx.hasService(ENTITLEMENT_GATE)) ctx.registerService(makeCapabilityGate())
  if (!ctx.hasService(LIMIT_GATE)) ctx.registerService(makeLimitGate())
  if (!ctx.hasService(ENTITLEMENT_SERVICE)) ctx.registerService(makeEntitlementService())
  // The consumer-rights records and service, with this gateway's `manage` unless the application
  // gave its own (before or after this call): the webhook writes purchases and locks, and an
  // unmanaged process still reads and asserts consent.
  registerConsumerRights(ctx, { manage: opts?.manage, dbAlias: opts?.dbAlias, serviceAlias: opts?.serviceAlias }, 'gateway')

  return ctx
}
