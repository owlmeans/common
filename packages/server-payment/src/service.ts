import { createService } from '@owlmeans/context'
import { configHelper } from '@owlmeans/config'
import type { ConfigRecord } from '@owlmeans/context'
import {
  appendPaymentService, CONSUMER_RIGHTS_RECORD_ID, DEFAULT_ALIAS as PAYMENT_SERVICE, DEFAULT_PRICING_POLICY,
  ENTITLEMENT_GATE, LIMIT_GATE, PaygateError, PRICING_POLICY_RECORD_ID, ProductError, type ConsumerRightsPolicy,
  type PricingPolicy,
} from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import {
  ENTITLEMENT_SERVICE, GATEWAY_SERVICE, RES_PAYGATE_CUSTOMER, RES_PAYMENT_FINGERPRINT, RES_PAYMENT_FULFILLMENT,
  RES_PAYMENT_GRANT, RES_PAYMENT_SUBSCRIPTION, RES_PAYMENT_USAGE, RES_PAYMENT_USAGE_COUNTER, RES_PAYMENT_WEBHOOK,
} from './consts.js'
import { registerConsumerRights } from './consumer/service.js'
import { makeEntitlementService } from './entitlement.js'
import { makeCapabilityGate } from './gate.js'
import { makeLimitGate } from './limit.js'
import { appendCompletionObserver } from './observer.js'
import {
  makeFingerprintResource, makeFulfillmentResource, makeGrantResource, makePaygateCustomerResource,
  makeSubscriptionResource, makeUsageCounterResource, makeUsageResource, makeWebhookResource,
} from './resource.js'
import type { Config, Context, GatewayService, PaymentGatewayOptions, PaymentPlan, GatewayServiceOptions } from './types.js'
import type { PaygateFeatures } from './paygate/types.js'
import { log } from './log.js'
import { paymentAccessOf } from './access.js'
import { catalogueOf } from './catalogue.js'
import { makePlanDeclarationsModel } from './models/declarations.js'
import { subscriptionCommitOf } from './commit.js'
import { paygateBootstrapOf } from './bootstrap.js'
import { productSyncOf } from './sync.js'
import { estimateOf } from './plugins/estimate.js'
import { makeEstimateCache } from './plugins/estimate/cache.js'
import { checkoutPluginsOf } from './plugins/checkout-plugins.js'
import { makeCheckoutPluginRegistry } from './plugins/checkout-registry.js'
import { portalOf } from './plugins/portal.js'
import { webhookOf } from './plugins/webhook-manager.js'
import { paygateSubscriptionsOf } from './plugins/subscriptions.js'
import { checkoutOf } from './checkout.js'
import { appendPaymentProviders } from './paygate/providers.js'
import { paygatesOf } from './paygate/registry.js'

const unmanaged = (): never => { throw new PaygateError('unmanaged') }

/** A singleton policy record read straight from the configuration (the boot checks run before any resource). */
const recordOf = <T>(cfg: Config, id: string): T | null => {
  const record = (cfg.records ?? []).find(entry => entry.id === id)
  return record != null ? configHelper.fromConfigRecord<ConfigRecord, T & { id?: string }>(record as ConfigRecord) : null
}

/**
 * The policy features every registered paygate must offer: a declared pricing policy or consumer-rights
 * mechanism a paygate cannot put on a checkout fails the boot.
 *
 * @throws PaygateError('feature:<flag>:<paygate>')
 */
const assertPaygateFeatures = (ctx: ApiContext): void => {
  const pricing = recordOf<PricingPolicy>(ctx.cfg, PRICING_POLICY_RECORD_ID) ?? DEFAULT_PRICING_POLICY
  const rights = recordOf<ConsumerRightsPolicy>(ctx.cfg, CONSUMER_RIGHTS_RECORD_ID)
  const required: Array<keyof PaygateFeatures> = [
    ...(pricing.tax?.automatic === true ? ['automaticTax' as const] : []),
    ...(pricing.tax?.collectTaxId === true ? ['taxIdCollection' as const] : []),
    ...(pricing.currency?.adaptive === true ? ['adaptiveCurrency' as const] : []),
    ...(rights?.mechanisms?.checkoutTerms === true ? ['termsConsent' as const] : []),
  ]
  for (const paygate of paygatesOf(ctx).all()) {
    const missing = required.find(flag => paygate.features[flag] !== true)
    if (missing != null) {
      throw new PaygateError(`feature:${missing}:${paygate.id}`)
    }
  }
}

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
 * The gateway service. `manage`, `bootstrap`, `owner` and `webhookService` are
 * `PaymentGatewayOptions`; the options are checked here (`assertGatewayOptions`). At initialization a
 * declared policy feature a registered paygate lacks fails the boot (`PaygateError('feature:…')`); a
 * managed, bootstrapping gateway also refuses to initialize without any registered payment provider
 * (`PaygateError('provider:none')`) or when its webhook service is not declared in `cfg.services`
 * (`WebhookSetupError('service:<alias>')`); a managed one without a provider only warns.
 */
export const makeGatewayService = (
  alias: string = GATEWAY_SERVICE, opts: GatewayServiceOptions = {},
): GatewayService => {
  assertGatewayOptions(opts)
  const managed = opts.manage !== false
  const bootstrap = opts.bootstrap ?? managed
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
    createLink: async (ctx, params) => managed
      ? await checkoutOf(ctx).createCheckoutLink(params, plugins.list()) : unmanaged(),
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
      ? await portalOf(ctx).createPortalLink(entityId, link) : unmanaged(),
    grantInternalPlan: async (ctx, entityId, planSku, grant) =>
      await subscriptionCommitOf(ctx).grantInternalPlan(entityId, planSku, grant),
    revokeInternalPlan: async (ctx, entityId, planSku) =>
      await subscriptionCommitOf(ctx).revokeInternalPlan(entityId, planSku),
    resyncSubscription: async (ctx, ref) => managed
      ? await paygateSubscriptionsOf(ctx).resyncSubscription(ref) : unmanaged(),
    resyncAll: async ctx => managed
      ? await paygateSubscriptionsOf(ctx).resyncAll() : unmanaged(),
    estimatePrice: async (ctx, params) => managed
      ? await estimateOf(ctx).estimatePrice(params, estimateCache) : unmanaged(),
  }, service => async () => {
    const ctx = service.assertCtx() as unknown as ApiContext
    makePlanDeclarationsModel(ctx.cfg).assertPlans()
    assertPaygateFeatures(ctx)
    if (managed && paygatesOf(ctx).all().length === 0) {
      if (bootstrap) {
        throw new PaygateError('provider:none')
      }
      log.warn('Payment gateway is managed but no payment provider is registered: checkout, the portal and the webhook refuse')
    }
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
        await paygateBootstrapOf(ctx).bootstrap()
      }).catch(error => { log.error('Paygate bootstrap failed', error) })
    }
  })

  return service
}

/**
 * Register the payment resources (the entitlement grants `payment-grant` included, on `dbAlias` like
 * the others), the catalogue service, the completion observer, the gateway, both gate services, the
 * entitlement service and the consumer-rights records and service — each only when not registered yet.
 *
 * `manage: false` registers the same surface for a process that reads entitlements but never talks
 * to a paygate. Several managed processes of one deployment share the paygate rows through one
 * `owner` and one `webhookService`; exactly one of them keeps `bootstrap` (the one receiving the
 * webhook). The paygates themselves come from the payment providers registered with
 * `ensurePaymentProviders(ctx).register(…)` (a provider package's `append…` helper), before or after.
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
    [RES_PAYMENT_GRANT, makeGrantResource],
  ] as const
  for (const [alias, maker] of makers) {
    if (!ctx.hasResource(alias)) {
      ctx.registerResource(maker(opts?.dbAlias, opts?.serviceAlias) as never)
    }
  }
  if (!ctx.hasService(PAYMENT_SERVICE)) appendPaymentService(ctx as never)
  appendPaymentProviders(ctx)
  appendCompletionObserver(ctx)
  if (!ctx.hasService(GATEWAY_SERVICE)) {
    ctx.registerService(makeGatewayService(GATEWAY_SERVICE, {
      manage: opts?.manage, bootstrap: opts?.bootstrap, owner: opts?.owner, webhookService: opts?.webhookService,
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
