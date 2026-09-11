import Stripe from 'stripe'
import { PLUGINS } from '@owlmeans/config'
import { DEFAULT_ALIAS as PAYMENT_SERVICE, SubscriptionStatus } from '@owlmeans/payment'
import type { PaymentService } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import {
  GATEWAY_SERVICE, PAYMENT_OBSERVER, RES_PAYGATE_CUSTOMER, RES_PAYMENT_FINGERPRINT,
  RES_PAYMENT_SUBSCRIPTION, STRIPE_PLUGIN_CONFIG,
} from './consts.js'
import type {
  CompletionObserver, FingerprintResource, GatewayService, PaygateCustomerResource,
  PaymentSubscriptionRecord, PaymentSubscriptionResource, StripePluginConfig,
} from './types.js'

export const payment = (ctx: ApiContext): PaymentService => ctx.service<PaymentService>(PAYMENT_SERVICE)
export const gateway = (ctx: ApiContext): GatewayService => ctx.service<GatewayService>(GATEWAY_SERVICE)
export const observer = (ctx: ApiContext): CompletionObserver => ctx.service<CompletionObserver>(PAYMENT_OBSERVER)
export const paygateCustomers = (ctx: ApiContext): PaygateCustomerResource =>
  ctx.resource<PaygateCustomerResource>(RES_PAYGATE_CUSTOMER)
export const subscriptions = (ctx: ApiContext): PaymentSubscriptionResource =>
  ctx.resource<PaymentSubscriptionResource>(RES_PAYMENT_SUBSCRIPTION)
export const fingerprints = (ctx: ApiContext): FingerprintResource =>
  ctx.resource<FingerprintResource>(RES_PAYMENT_FINGERPRINT)
export const stripeConfig = async (ctx: ApiContext): Promise<StripePluginConfig> =>
  await (ctx as never as { getConfigResource: (alias: string) => { get: (id: string) => Promise<unknown> } })
    .getConfigResource(PLUGINS).get(STRIPE_PLUGIN_CONFIG) as StripePluginConfig
export const stripeClient = async (ctx: ApiContext): Promise<Stripe> => new Stripe((await stripeConfig(ctx)).api)
export const activeSubscription = async (
  ctx: ApiContext, entityId: string, productSku: string,
): Promise<PaymentSubscriptionRecord | null> => await subscriptions(ctx).load({
  entityId, productSku, kind: 'subscription',
  status: [SubscriptionStatus.Active, SubscriptionStatus.Trial],
})
