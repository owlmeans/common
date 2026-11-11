import { AppType } from '@owlmeans/context'
import { config as serverConfig, makeServerContext, type ServerConfig } from '@owlmeans/server-context'
import type { ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import { makeConsoleMailerService, MAILER_SERVICE } from '@owlmeans/mailer'
import type { Context as ApiContext } from '@owlmeans/server-api'
import {
  appendConsumerRights, appendPaymentGatewayService, declareConsumerRights, declarePaymentPricing, ensurePaymentProviders,
  makeBillingProfileResource, makeConsumerConsentResource, makeConsumerDeclarationResource, makeConsumerEventResource,
  makeFingerprintResource, makeFulfillmentResource, makeGrantResource, makePaygateCustomerResource, makePurchaseResource,
  makeSubscriptionResource, makeUsageCounterResource, makeUsageResource, makeWebhookResource, paymentAccessOf,
  RES_BILLING_PROFILE, RES_CONSUMER_CONSENT, RES_CONSUMER_DECLARATION, RES_CONSUMER_EVENT, RES_PAYGATE_CUSTOMER,
  RES_PAYMENT_FINGERPRINT, RES_PAYMENT_FULFILLMENT, RES_PAYMENT_GRANT, RES_PAYMENT_PURCHASE, RES_PAYMENT_SUBSCRIPTION,
  RES_PAYMENT_USAGE, RES_PAYMENT_USAGE_COUNTER, RES_PAYMENT_WEBHOOK,
  type Config, type ConsumerRightsOptions, type GatewayServiceOptions,
} from '@owlmeans/server-payment'
import { HOST, SERVICE } from './consts.js'
import { declareTestCatalogue } from './catalogue.js'
import { memoryResource } from './memory.js'
import type { MemoryStore } from './memory/types.js'
import { makeFakePaygate } from './paygate.js'
import type { CapturingMailer, FakeContext, FakeContextOptions, Observed } from './context/types.js'

/**
 * A real server context — real catalogue, payment service, observer, gateway (unmanaged unless
 * `gateway` says otherwise), gates, entitlement and consumer-rights services — over in-memory
 * resources (unique and sparse-unique indexes, raw conditional updates), with the payment providers
 * `providers` names (default: one fake paygate), a console mailer and every observer recorded.
 */
export const makeFakeContext = async (opts: FakeContextOptions = {}): Promise<FakeContext> => {
  const own = opts.service ?? SERVICE
  const services: Record<string, unknown> = {
    [own]: { service: own, type: AppType.Backend, host: opts.host ?? HOST, ...(opts.base != null ? { base: opts.base } : {}) },
  }
  for (const [alias, { host, base }] of Object.entries(opts.services ?? {})) {
    services[alias] = { service: alias, type: AppType.Backend, host, ...(base != null ? { base } : {}) }
  }
  const cfg = serverConfig<ServerConfig>(own, { services } as Partial<ServerConfig>) as unknown as Config
  if (opts.declare != null) {
    opts.declare(cfg)
  } else {
    declareTestCatalogue(cfg, opts.catalogue)
  }
  opts.configure?.(cfg)
  if (opts.pricing != null) {
    declarePaymentPricing(cfg, opts.pricing)
  }
  if (opts.consumerRights != null) {
    declareConsumerRights(cfg, opts.consumerRights)
  }

  const ctx = makeServerContext(cfg as unknown as ServerConfig) as unknown as ApiContext
  const stores: Record<string, MemoryStore> = {}
  const resources = [
    [RES_PAYGATE_CUSTOMER, makePaygateCustomerResource()],
    [RES_PAYMENT_SUBSCRIPTION, makeSubscriptionResource()],
    [RES_PAYMENT_FULFILLMENT, makeFulfillmentResource()],
    [RES_PAYMENT_WEBHOOK, makeWebhookResource()],
    [RES_PAYMENT_USAGE, makeUsageResource()],
    [RES_PAYMENT_USAGE_COUNTER, makeUsageCounterResource()],
    [RES_PAYMENT_FINGERPRINT, makeFingerprintResource()],
    [RES_BILLING_PROFILE, makeBillingProfileResource()],
    [RES_PAYMENT_PURCHASE, makePurchaseResource()],
    [RES_CONSUMER_CONSENT, makeConsumerConsentResource()],
    [RES_CONSUMER_DECLARATION, makeConsumerDeclarationResource()],
    [RES_CONSUMER_EVENT, makeConsumerEventResource()],
    [RES_PAYMENT_GRANT, makeGrantResource()],
  ] as const
  for (const [alias, resource] of resources) {
    stores[alias] = memoryResource(resource as unknown as MongoResource<ResourceRecord>)
    stores[alias].rows.push(...structuredClone(opts.seed?.[alias] ?? []))
    ctx.registerResource(resource as never)
  }
  const paygate = opts.providers == null ? makeFakePaygate() : undefined
  for (const provider of opts.providers ?? (paygate != null ? [paygate.provider] : [])) {
    ensurePaymentProviders(ctx as never).register(provider)
  }
  const mailer = makeConsoleMailerService(MAILER_SERVICE) as unknown as CapturingMailer
  if (opts.mailer !== false) {
    ctx.registerService(mailer)
  }
  const rights: ConsumerRightsOptions = opts.rights?.() ?? { manage: true, ...(opts.meter != null ? { usage: opts.meter } : {}) }
  const gatewayOpts: GatewayServiceOptions = { manage: false, ...opts.gateway }
  if (opts.gatewayFirst === true) {
    appendPaymentGatewayService(ctx as never, gatewayOpts)
    appendConsumerRights(ctx as never, rights)
  } else {
    appendConsumerRights(ctx as never, rights)
    appendPaymentGatewayService(ctx as never, gatewayOpts)
  }
  opts.wire?.(ctx)
  ctx.configure()
  await ctx.init()

  const observed: Observed = {
    topUp: [], subscription: [], refund: [], dispute: [], paymentFailed: [], consent: [], withdrawal: [],
    cancellation: [], grant: [], failSubscription: 0, failTopUp: 0, failWithdrawal: 0, failGrant: 0,
  }
  const completions = paymentAccessOf(ctx).observer()
  await completions.ready()
  completions.onTopUp(async event => {
    if (observed.failTopUp > 0) {
      observed.failTopUp--
      throw new Error('ledger unavailable')
    }
    await observed.onTopUp?.(event)
    observed.topUp.push(event)
  })
  completions.onSubscription(async event => {
    if (observed.failSubscription > 0) {
      observed.failSubscription--
      throw new Error('observer unavailable')
    }
    await observed.onSubscription?.(event)
    observed.subscription.push(event)
  })
  completions.onRefund(async event => { observed.refund.push(event) })
  completions.onDispute(async event => { observed.dispute.push(event) })
  completions.onPaymentFailed(async event => { observed.paymentFailed.push(event) })
  completions.onConsent(async event => { observed.consent.push(event) })
  completions.onWithdrawal(async event => {
    if (observed.failWithdrawal > 0) {
      observed.failWithdrawal--
      throw new Error('ledger unavailable')
    }
    observed.withdrawal.push(event)
  })
  completions.onCancellation(async event => { observed.cancellation.push(event) })
  completions.onEntitlementGrant(async event => {
    if (observed.failGrant > 0) {
      observed.failGrant--
      throw new Error('sweeps unavailable')
    }
    observed.grant.push(event)
  })

  return { ctx, stores, observed, mails: mailer.captured, mailer, ...(paygate != null ? { paygate } : {}) }
}
