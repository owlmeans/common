import Stripe from 'stripe'
import { PLUGINS } from '@owlmeans/config'
import { MONGO_DUPLICATE_KEY } from '@owlmeans/mongo-resource'
import { DEFAULT_ALIAS as PAYMENT_SERVICE, ENTITLING_STATUSES, WebhookSetupError } from '@owlmeans/payment'
import type { PaymentService } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import {
  ENTITLEMENT_SERVICE, GATEWAY_SERVICE, PAYMENT_OBSERVER, RES_PAYGATE_CUSTOMER, RES_PAYMENT_FINGERPRINT,
  RES_PAYMENT_FULFILLMENT, RES_PAYMENT_SUBSCRIPTION, RES_PAYMENT_USAGE, RES_PAYMENT_USAGE_COUNTER,
  RES_PAYMENT_WEBHOOK, STRIPE_PLUGIN_CONFIG, STRIPE_PORTAL_PLUGIN_CONFIG,
} from './consts.js'
import type {
  CompletionObserver, EntitlementService, FingerprintResource, GatewayService, PaygateCustomerResource,
  PaymentFulfillmentResource, PaymentSubscriptionRecord, PaymentSubscriptionResource,
  PaymentUsageCounterResource, PaymentUsageResource, PaymentWebhookResource, PortalBrandingConfig,
  StripePluginConfig,
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

type PluginReader = { getConfigResource: (alias: string) => {
  get: (id: string) => Promise<unknown>
  load: (id: string) => Promise<unknown>
} }

export const stripeConfig = async (ctx: ApiContext): Promise<StripePluginConfig> =>
  await (ctx as never as PluginReader).getConfigResource(PLUGINS).get(STRIPE_PLUGIN_CONFIG) as StripePluginConfig

/** The portal branding declared with `portalBranding`, or `null`. */
export const portalBrandingConfig = async (ctx: ApiContext): Promise<PortalBrandingConfig | null> =>
  await (ctx as never as PluginReader).getConfigResource(PLUGINS).load(STRIPE_PORTAL_PLUGIN_CONFIG) as PortalBrandingConfig | null

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
