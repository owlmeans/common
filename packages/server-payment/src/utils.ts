import Stripe from 'stripe'
import { PLUGINS } from '@owlmeans/config'
import { MONGO_DUPLICATE_KEY } from '@owlmeans/mongo-resource'
import { DEFAULT_ALIAS as PAYMENT_SERVICE, ENTITLING_STATUSES, WebhookSetupError } from '@owlmeans/payment'
import type { PaymentService } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import {
  CONSUMER_RIGHTS_MAIL_PLUGIN_CONFIG, CONSUMER_RIGHTS_SERVICE, ENTITLEMENT_SERVICE, GATEWAY_SERVICE,
  PAYMENT_OBSERVER, RES_BILLING_PROFILE, RES_CONSUMER_CONSENT, RES_CONSUMER_DECLARATION, RES_CONSUMER_EVENT,
  RES_PAYGATE_CUSTOMER, RES_PAYMENT_FINGERPRINT, RES_PAYMENT_FULFILLMENT, RES_PAYMENT_PURCHASE,
  RES_PAYMENT_SUBSCRIPTION, RES_PAYMENT_USAGE, RES_PAYMENT_USAGE_COUNTER, RES_PAYMENT_WEBHOOK, STRIPE_PLUGIN_CONFIG,
  STRIPE_PORTAL_PLUGIN_CONFIG, STRIPE_PRICING_PLUGIN_CONFIG,
} from './consts.js'
import type {
  BillingProfileResource, CompletionObserver, ConsumerConsentResource, ConsumerDeclarationResource,
  ConsumerEventResource, ConsumerMailPluginConfig, ConsumerRightsService, EntitlementService, FingerprintResource,
  GatewayService, PaygateCustomerResource, PaymentFulfillmentResource, PaymentSubscriptionRecord,
  PaymentSubscriptionResource, PaymentUsageCounterResource, PaymentUsageResource, PaymentWebhookResource,
  PortalBrandingConfig, PurchaseResource, StripePluginConfig, StripePricingPluginConfig,
} from './types.js'

export const payment = (ctx: ApiContext): PaymentService => ctx.service<PaymentService>(PAYMENT_SERVICE)
export const gateway = (ctx: ApiContext): GatewayService => ctx.service<GatewayService>(GATEWAY_SERVICE)
export const observer = (ctx: ApiContext): CompletionObserver => ctx.service<CompletionObserver>(PAYMENT_OBSERVER)
export const entitlements = (ctx: ApiContext): EntitlementService =>
  ctx.service<EntitlementService>(ENTITLEMENT_SERVICE)

export const paygateCustomers = (ctx: ApiContext): PaygateCustomerResource =>
  ctx.resource<PaygateCustomerResource>(RES_PAYGATE_CUSTOMER)
export const subscriptions = (ctx: ApiContext): PaymentSubscriptionResource =>
  ctx.resource<PaymentSubscriptionResource>(RES_PAYMENT_SUBSCRIPTION)
export const fulfillments = (ctx: ApiContext): PaymentFulfillmentResource =>
  ctx.resource<PaymentFulfillmentResource>(RES_PAYMENT_FULFILLMENT)
export const paymentWebhooks = (ctx: ApiContext): PaymentWebhookResource =>
  ctx.resource<PaymentWebhookResource>(RES_PAYMENT_WEBHOOK)
export const usageEvents = (ctx: ApiContext): PaymentUsageResource =>
  ctx.resource<PaymentUsageResource>(RES_PAYMENT_USAGE)
export const usageCounters = (ctx: ApiContext): PaymentUsageCounterResource =>
  ctx.resource<PaymentUsageCounterResource>(RES_PAYMENT_USAGE_COUNTER)
export const fingerprints = (ctx: ApiContext): FingerprintResource =>
  ctx.resource<FingerprintResource>(RES_PAYMENT_FINGERPRINT)
export const billingProfiles = (ctx: ApiContext): BillingProfileResource =>
  ctx.resource<BillingProfileResource>(RES_BILLING_PROFILE)
export const purchases = (ctx: ApiContext): PurchaseResource => ctx.resource<PurchaseResource>(RES_PAYMENT_PURCHASE)
export const consumerConsents = (ctx: ApiContext): ConsumerConsentResource =>
  ctx.resource<ConsumerConsentResource>(RES_CONSUMER_CONSENT)
export const consumerDeclarations = (ctx: ApiContext): ConsumerDeclarationResource =>
  ctx.resource<ConsumerDeclarationResource>(RES_CONSUMER_DECLARATION)
export const consumerEvents = (ctx: ApiContext): ConsumerEventResource =>
  ctx.resource<ConsumerEventResource>(RES_CONSUMER_EVENT)

/** The consumer-rights service. @throws when it is not registered */
export const consumerRights = (ctx: ApiContext, alias: string = CONSUMER_RIGHTS_SERVICE): ConsumerRightsService =>
  ctx.service<ConsumerRightsService>(alias)

/** The consumer-rights service, or `null` in a process that registered none. */
export const consumerRightsOf = (ctx: ApiContext, alias: string = CONSUMER_RIGHTS_SERVICE): ConsumerRightsService | null =>
  (ctx as unknown as { hasService?: (alias: string) => boolean }).hasService?.(alias) === true
    ? ctx.service<ConsumerRightsService>(alias) : null

type PluginReader = { getConfigResource: (alias: string) => {
  get: (id: string) => Promise<unknown>
  load: (id: string) => Promise<unknown>
} }

export const stripeConfig = async (ctx: ApiContext): Promise<StripePluginConfig> =>
  await (ctx as never as PluginReader).getConfigResource(PLUGINS).get(STRIPE_PLUGIN_CONFIG) as StripePluginConfig

/** The portal branding declared with `portalBranding`, or `null`. */
export const portalBrandingConfig = async (ctx: ApiContext): Promise<PortalBrandingConfig | null> =>
  await (ctx as never as PluginReader).getConfigResource(PLUGINS).load(STRIPE_PORTAL_PLUGIN_CONFIG) as PortalBrandingConfig | null

/** The consumer-rights mail options declared with `declareConsumerRights`, or `null`. */
export const consumerMailConfig = async (ctx: ApiContext): Promise<ConsumerMailPluginConfig | null> =>
  await (ctx as never as PluginReader).getConfigResource(PLUGINS).load(CONSUMER_RIGHTS_MAIL_PLUGIN_CONFIG) as ConsumerMailPluginConfig | null

/** The Stripe-only pricing settings declared with `declarePaymentPricing`, or `null`. */
export const stripePricingConfig = async (ctx: ApiContext): Promise<StripePricingPluginConfig | null> =>
  await (ctx as never as PluginReader).getConfigResource(PLUGINS).load(STRIPE_PRICING_PLUGIN_CONFIG) as StripePricingPluginConfig | null

/**
 * A Stripe client pinned to the API version the installed SDK is typed for (its default), so every
 * object shape this package reads is the one the types describe.
 */
export const stripeClient = async (ctx: ApiContext): Promise<Stripe> => new Stripe((await stripeConfig(ctx)).api)

/**
 * The API version a client was built with — read back from the client, never written as a literal,
 * so a webhook endpoint always receives the payload shapes the client itself parses.
 */
export const apiVersionOf = (stripe: Stripe): string => {
  const version = (stripe as unknown as { getApiField?: (key: string) => unknown }).getApiField?.('version')
  if (typeof version !== 'string' || version === '') {
    throw new WebhookSetupError('api-version')
  }

  return version
}

export const isDuplicateKey = (error: unknown): boolean =>
  (error as { code?: unknown } | null)?.code === MONGO_DUPLICATE_KEY

/** A paygate answer meaning the object does not exist (deleted, or never did). */
export const isMissingObject = (error: unknown): boolean => {
  const typed = error as { code?: unknown; statusCode?: unknown; raw?: { code?: unknown } } | null
  return typed?.code === 'resource_missing' || typed?.raw?.code === 'resource_missing' || typed?.statusCode === 404
}

/** A paygate object reference, expanded or not, as its id. */
export const idOf = (value: string | { id?: string } | null | undefined): string | undefined =>
  value == null ? undefined : typeof value === 'string' ? value : value.id

/** Epoch seconds → `Date`. */
export const dateOf = (seconds: number | null | undefined): Date | undefined =>
  seconds == null ? undefined : new Date(seconds * 1000)

/** Drop `null` and `undefined` properties — a stored record reads an absent field back as `null`. */
export const compact = <T extends object>(value: T): T =>
  Object.fromEntries(Object.entries(value).filter(([, entry]) => entry != null)) as T

/** The entity's highest-ranked entitling subscription of one product. */
export const activeSubscription = async (
  ctx: ApiContext, entityId: string, productSku: string,
): Promise<PaymentSubscriptionRecord | null> => await subscriptions(ctx).load({
  entityId, productSku, status: [...ENTITLING_STATUSES],
}, { sort: [{ field: 'rank', order: 'desc' }, { field: 'createdAt', order: 'desc' }] })

/** A conditional single-document `$set` — `true` when the filter matched (the guard held). */
export const conditionalSet = async (
  resource: { collection: unknown }, filter: Record<string, unknown>, set: Record<string, unknown>,
): Promise<boolean> => {
  const collection = resource.collection as {
    updateOne: (filter: object, update: object) => Promise<{ matchedCount?: number, modifiedCount?: number }>
  }
  const result = await collection.updateOne(filter, { $set: set })

  return (result.matchedCount ?? result.modifiedCount ?? 0) > 0
}

/** A conditional single-document delete — `true` when the filter matched (the guard held). */
export const conditionalDelete = async (resource: { collection: unknown }, filter: Record<string, unknown>): Promise<boolean> => {
  const collection = resource.collection as { deleteOne: (filter: object) => Promise<{ deletedCount?: number }> }
  const result = await collection.deleteOne(filter)

  return (result.deletedCount ?? 0) > 0
}

/** An error's message for an audit record, never a stack. */
export const errorText = (error: unknown): string =>
  (error instanceof Error ? error.message : String(error)).slice(0, 1000)
