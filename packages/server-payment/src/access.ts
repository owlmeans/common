import Stripe from 'stripe'
import { PLUGINS } from '@owlmeans/config'
import { memoHelper } from '@owlmeans/context'
import { DEFAULT_ALIAS as PAYMENT_SERVICE, ENTITLING_STATUSES, type PaymentService } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import {
  CONSUMER_RIGHTS_MAIL_PLUGIN_CONFIG, CONSUMER_RIGHTS_SERVICE, ENTITLEMENT_SERVICE, GATEWAY_SERVICE,
  PAYMENT_OBSERVER, RES_BILLING_PROFILE, RES_CONSUMER_CONSENT, RES_CONSUMER_DECLARATION, RES_CONSUMER_EVENT,
  RES_PAYGATE_CUSTOMER, RES_PAYMENT_FINGERPRINT, RES_PAYMENT_FULFILLMENT, RES_PAYMENT_PURCHASE,
  RES_PAYMENT_SUBSCRIPTION, RES_PAYMENT_USAGE, RES_PAYMENT_USAGE_COUNTER, RES_PAYMENT_WEBHOOK,
  STRIPE_PINNED_API_VERSION, STRIPE_PLUGIN_CONFIG, STRIPE_PORTAL_PLUGIN_CONFIG, STRIPE_PRICING_PLUGIN_CONFIG,
} from './consts.js'
import type {
  BillingProfileResource, CompletionObserver, ConsumerConsentResource, ConsumerDeclarationResource,
  ConsumerEventResource, ConsumerMailPluginConfig, ConsumerRightsService, EntitlementService, FingerprintResource,
  GatewayService, PaygateCustomerResource, PaymentFulfillmentResource, PaymentSubscriptionRecord,
  PaymentSubscriptionResource, PaymentUsageCounterResource, PaymentUsageResource, PaymentWebhookResource,
  PortalBrandingConfig, PurchaseResource, StripePluginConfig, StripePricingPluginConfig,
} from './types.js'
import type { PluginReader } from './types.local.js'
import type { PaymentAccess } from './access/types.js'

export const makePaymentAccess = (ctx: ApiContext): PaymentAccess => {
  const hasService = (alias: string): boolean =>
    (ctx as unknown as { hasService?: (alias: string) => boolean }).hasService?.(alias) === true
  const plugins = () => (ctx as never as PluginReader).getConfigResource(PLUGINS)

  const payment = (): PaymentService => ctx.service<PaymentService>(PAYMENT_SERVICE)
  const gateway = (): GatewayService => ctx.service<GatewayService>(GATEWAY_SERVICE)
  const gatewayOf = (): GatewayService | null => hasService(GATEWAY_SERVICE) ? gateway() : null
  const observer = (): CompletionObserver => ctx.service<CompletionObserver>(PAYMENT_OBSERVER)
  const entitlements = (): EntitlementService => ctx.service<EntitlementService>(ENTITLEMENT_SERVICE)

  const paygateCustomers = (): PaygateCustomerResource => ctx.resource<PaygateCustomerResource>(RES_PAYGATE_CUSTOMER)
  const subscriptions = (): PaymentSubscriptionResource =>
    ctx.resource<PaymentSubscriptionResource>(RES_PAYMENT_SUBSCRIPTION)
  const fulfillments = (): PaymentFulfillmentResource => ctx.resource<PaymentFulfillmentResource>(RES_PAYMENT_FULFILLMENT)
  const paymentWebhooks = (): PaymentWebhookResource => ctx.resource<PaymentWebhookResource>(RES_PAYMENT_WEBHOOK)
  const usageEvents = (): PaymentUsageResource => ctx.resource<PaymentUsageResource>(RES_PAYMENT_USAGE)
  const usageCounters = (): PaymentUsageCounterResource =>
    ctx.resource<PaymentUsageCounterResource>(RES_PAYMENT_USAGE_COUNTER)
  const fingerprints = (): FingerprintResource => ctx.resource<FingerprintResource>(RES_PAYMENT_FINGERPRINT)
  const billingProfiles = (): BillingProfileResource => ctx.resource<BillingProfileResource>(RES_BILLING_PROFILE)
  const purchases = (): PurchaseResource => ctx.resource<PurchaseResource>(RES_PAYMENT_PURCHASE)
  const consumerConsents = (): ConsumerConsentResource => ctx.resource<ConsumerConsentResource>(RES_CONSUMER_CONSENT)
  const consumerDeclarations = (): ConsumerDeclarationResource =>
    ctx.resource<ConsumerDeclarationResource>(RES_CONSUMER_DECLARATION)
  const consumerEvents = (): ConsumerEventResource => ctx.resource<ConsumerEventResource>(RES_CONSUMER_EVENT)

  const consumerRights = (alias: string = CONSUMER_RIGHTS_SERVICE): ConsumerRightsService =>
    ctx.service<ConsumerRightsService>(alias)

  const consumerRightsOf = (alias: string = CONSUMER_RIGHTS_SERVICE): ConsumerRightsService | null =>
    hasService(alias) ? ctx.service<ConsumerRightsService>(alias) : null

  const stripeConfig = async (): Promise<StripePluginConfig> =>
    await plugins().get(STRIPE_PLUGIN_CONFIG) as StripePluginConfig

  const portalBrandingConfig = async (): Promise<PortalBrandingConfig | null> =>
    await plugins().load(STRIPE_PORTAL_PLUGIN_CONFIG) as PortalBrandingConfig | null

  const consumerMailConfig = async (): Promise<ConsumerMailPluginConfig | null> =>
    await plugins().load(CONSUMER_RIGHTS_MAIL_PLUGIN_CONFIG) as ConsumerMailPluginConfig | null

  const stripePricingConfig = async (): Promise<StripePricingPluginConfig | null> =>
    await plugins().load(STRIPE_PRICING_PLUGIN_CONFIG) as StripePricingPluginConfig | null

  const stripeClient = async (): Promise<Stripe> =>
    new Stripe((await stripeConfig()).api, { apiVersion: STRIPE_PINNED_API_VERSION as never })

  const activeSubscription = async (
    entityId: string, productSku: string,
  ): Promise<PaymentSubscriptionRecord | null> => await subscriptions().load({
    entityId, productSku, status: [...ENTITLING_STATUSES],
  }, { sort: [{ field: 'rank', order: 'desc' }, { field: 'createdAt', order: 'desc' }] })

  return {
    payment, gateway, gatewayOf, observer, entitlements, paygateCustomers, subscriptions, fulfillments,
    paymentWebhooks, usageEvents, usageCounters, fingerprints, billingProfiles, purchases, consumerConsents,
    consumerDeclarations, consumerEvents, consumerRights, consumerRightsOf, stripeConfig, portalBrandingConfig,
    consumerMailConfig, stripePricingConfig, stripeClient, activeSubscription,
  }
}

/** The payment access of a context — one per context. */
export const paymentAccessOf = memoHelper.oncePer(makePaymentAccess)
