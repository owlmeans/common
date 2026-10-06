import type Stripe from 'stripe'
import { createService } from '@owlmeans/context'
import {
  appendPaymentService, DEFAULT_ALIAS as PAYMENT_SERVICE, ENTITLEMENT_GATE, LIMIT_GATE, PaygateError, ProductError,
} from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import {
  ENTITLEMENT_SERVICE, GATEWAY_SERVICE, RES_PAYGATE_CUSTOMER, RES_PAYMENT_FINGERPRINT, RES_PAYMENT_FULFILLMENT,
  RES_PAYMENT_SUBSCRIPTION, RES_PAYMENT_USAGE, RES_PAYMENT_USAGE_COUNTER, RES_PAYMENT_WEBHOOK,
} from './consts.js'
import { registerConsumerRights } from './consumer/service.js'
import { makeEntitlementService } from './entitlement.js'
import { makeCapabilityGate } from './gate.js'
import { makeLimitGate } from './limit.js'
import { appendCompletionObserver } from './observer.js'
import {
  makeFingerprintResource, makeFulfillmentResource, makePaygateCustomerResource, makeSubscriptionResource,
  makeUsageCounterResource, makeUsageResource, makeWebhookResource,
} from './resource.js'
import type {
  Config, Context, GatewayService, PaymentGatewayOptions, PaymentPlan, GatewayServiceOptions, StripeBootstrapOptions,
} from './types.js'
import { log } from './log.js'
import { paymentAccessOf } from './access.js'
import { catalogueOf } from './catalogue.js'
import { makePlanDeclarationsModel } from './models/declarations.js'
import { subscriptionCommitOf } from './commit.js'
import { stripeBootstrapOf } from './bootstrap.js'
import { productSyncOf } from './sync.js'
import { estimateOf } from './plugins/estimate.js'
import { makeEstimateCache } from './plugins/estimate/cache.js'
import { checkoutPluginsOf } from './plugins/checkout-plugins.js'
import { makeCheckoutPluginRegistry } from './plugins/checkout-registry.js'
import { portalOf } from './plugins/portal.js'
import { webhookOf } from './plugins/webhook-manager.js'
import { stripeSubscriptionsOf } from './plugins/subscriptions.js'
import { stripeCheckoutOf } from './plugins/stripe.js'

const unmanaged = (): never => { throw new PaygateError('unmanaged') }

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
  const stripeOf = opts.stripe
    ?? (async (ctx: ApiContext): Promise<Stripe> => await paymentAccessOf(ctx).stripeClient())
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
      ? await stripeCheckoutOf(ctx).createCheckoutLink(await stripeOf(ctx), params, plugins.list()) : unmanaged(),
    use: plugin => { plugins.use(plugin) },
    checkoutPlugins: () => plugins.list(),
    amountPolicy: async (ctx, entityId, productSku, planSku) => {
      const { plan } = await catalogueOf(ctx).consumablePlanOf(productSku, planSku)
      if (plan.amountPolicy == null) throw new ProductError(`amount-policy:${plan.sku}`)
      return await checkoutPluginsOf(ctx).narrowAmountFor(plugins.list(), {
        entityId, productSku, planSku: (plan as PaymentPlan).sku, base: plan.amountPolicy, at: new Date(),
      })
    },
    planPrices: async (ctx, productSku) => await productSyncOf(ctx).syncedPlanPrices(productSku),
    portalLink: async (ctx, entityId, link) => managed
      ? await portalOf(ctx).createPortalLink(await stripeOf(ctx), entityId, link) : unmanaged(),
    grantInternalPlan: async (ctx, entityId, planSku, grant) =>
      await subscriptionCommitOf(ctx).grantInternalPlan(entityId, planSku, grant),
    resyncSubscription: async (ctx, ref) => managed
      ? await stripeSubscriptionsOf(ctx).resyncStripeSubscription(await stripeOf(ctx), ref) : unmanaged(),
    resyncAll: async ctx => managed
      ? await stripeSubscriptionsOf(ctx).resyncStripeSubscriptions(await stripeOf(ctx)) : unmanaged(),
    estimatePrice: async (ctx, params) => managed
      ? await estimateOf(ctx).estimateStripePrice(await stripeOf(ctx), params, estimateCache) : unmanaged(),
  }, service => async () => {
    const ctx = service.assertCtx() as unknown as ApiContext
    makePlanDeclarationsModel(ctx.cfg).assertPlans()
    if (bootstrap) {
      // Every boot bootstrap forms the webhook URL on this alias: an undeclared one fails the boot.
      webhookOf(ctx).webhookRouteOf(opts.webhookService ?? ctx.cfg.service)
    }
    service.initialized = true
    // The consumer-rights service is lazy (reachable while the application is wired): initialize it
    // with the gateway, so its boot checks run at boot.
    paymentAccessOf(ctx).consumerRightsOf()
    if (bootstrap) {
      void ctx.waitForInitialized().then(async () => {
        await stripeBootstrapOf(ctx).bootstrapStripe(await stripeOf(ctx))
      }).catch(error => { log.error('Stripe bootstrap failed', error) })
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

/** @deprecated compat:factory-refactor — use `stripeBootstrapOf(ctx).bootstrapStripe(…)` */
export const bootstrapStripe = async (
  ctx: ApiContext, stripe: Stripe, opts: StripeBootstrapOptions = {},
): Promise<void> => { await stripeBootstrapOf(ctx).bootstrapStripe(stripe, opts) }
