import { createService } from '@owlmeans/context'
import { DEFAULT_ALIAS as PAYMENT_SERVICE, ENTITLEMENT_GATE, appendPaymentService } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { GATEWAY_SERVICE, RES_PAYGATE_CUSTOMER, RES_PAYMENT_FINGERPRINT, RES_PAYMENT_SUBSCRIPTION } from './consts.js'
import { makeEntitlementGate } from './gate.js'
import { appendCompletionObserver } from './observer.js'
import { stripePlugin } from './plugins/stripe.js'
import { makeFingerprintResource, makePaygateCustomerResource, makeSubscriptionResource } from './resource.js'
import { initialize } from './sync.js'
import type { Config, Context, GatewayService, PaymentResourceOptions } from './types.js'

export const makeGatewayService = (alias: string = GATEWAY_SERVICE): GatewayService => {
  const service = createService<GatewayService>(alias, {
    createLink: async (ctx, params) => stripePlugin.createLink(ctx, params),
    manageSubscription: async (ctx, entityId, returnUrl) => stripePlugin.manageSubscription(ctx, entityId, returnUrl),
  }, service => async () => {
    service.initialized = true
    const ctx = service.assertCtx() as ApiContext
    ctx.waitForInitialized().then(() => initialize(ctx).catch(console.error))
  })
  return service
}

export const appendPaymentGatewayService = <C extends Config, T extends Context<C>>(
  ctx: T, opts?: PaymentResourceOptions,
): T => {
  if (!ctx.hasResource(RES_PAYGATE_CUSTOMER)) ctx.registerResource(makePaygateCustomerResource(opts?.dbAlias, opts?.serviceAlias))
  if (!ctx.hasResource(RES_PAYMENT_SUBSCRIPTION)) ctx.registerResource(makeSubscriptionResource(opts?.dbAlias, opts?.serviceAlias))
  if (!ctx.hasResource(RES_PAYMENT_FINGERPRINT)) ctx.registerResource(makeFingerprintResource(opts?.dbAlias, opts?.serviceAlias))
  if (!ctx.hasService(PAYMENT_SERVICE)) appendPaymentService(ctx as never)
  appendCompletionObserver(ctx)
  ctx.registerService(makeGatewayService())
  if (!ctx.hasService(ENTITLEMENT_GATE)) ctx.registerService(makeEntitlementGate())
  return ctx
}
