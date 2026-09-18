import { contract, protocol, schema, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod } from '@owlmeans/route'
import { GUARD_ED25519 } from '@owlmeans/server-app'
import { INTERNAL_PAYGATE, LIMIT_GATE } from '@owlmeans/payment'
import type { JSONSchemaType } from 'ajv'

export { INTERNAL_PAYGATE, LIMIT_GATE }

export const STRIPE_PAYGATE_ALIAS = 'stripe'
export const STRIPE_PLUGIN_CONFIG = '_external:stripe'
export const STRIPE_PORTAL_PLUGIN_CONFIG = '_external:stripe-portal'
/** Stripe-only pricing settings (FX Quotes API version, the unspecified-price migration switch) — never advertised to the browser, unlike the `PricingPolicy` record itself. */
export const STRIPE_PRICING_PLUGIN_CONFIG = '_external:stripe-pricing'
export const STRIPE_SIGNATURE = 'Stripe-Signature'

/**
 * The FX Quotes API is a Stripe PREVIEW endpoint as of this writing: it answers only a
 * `Stripe-Version` header naming a preview version, never the SDK's pinned stable one. Verify this
 * string against https://docs.stripe.com/api/fx_quotes/create before relying on it, and override it
 * with `declarePaymentPricing({ stripe: { fxApiVersion } })` once Stripe moves the API or renames
 * the preview.
 */
export const STRIPE_FX_QUOTES_API_VERSION = '2025-07-30.preview'
export const GATEWAY_SERVICE = 'payment-gateway'
export const PAYMENT_OBSERVER = 'payment-observer'
export const ENTITLEMENT_SERVICE = 'payment-entitlement'

export const RES_PAYGATE_CUSTOMER = 'payment-paygate-customer'
export const RES_PAYMENT_SUBSCRIPTION = 'payment-subscription'
export const RES_PAYMENT_FULFILLMENT = 'payment-fulfillment'
export const RES_PAYMENT_WEBHOOK = 'payment-webhook'
export const RES_PAYMENT_USAGE = 'payment-usage'
export const RES_PAYMENT_USAGE_COUNTER = 'payment-usage-counter'
export const RES_PAYMENT_FINGERPRINT = 'payment-fingerprint'

/** Fingerprint sku prefix of a portal configuration: `portal:<service>`. */
export const FINGERPRINT_PORTAL = 'portal'

/**
 * The metadata every Stripe object this package creates carries (`{ owlmeans: 'payment', service }`).
 * It labels the object for an operator; several deployments of one service share it, so it never
 * decides on its own that an object belongs to this deployment.
 */
export const STRIPE_OWNER_KEY = 'owlmeans'
export const STRIPE_OWNER_VALUE = 'payment'

/**
 * The metadata key naming the ONE deployment a portal configuration belongs to, valued with that
 * deployment's webhook URL (`webhookUrlOf`). Only an exact match lets a deployment adopt a
 * configuration it holds no fingerprint row for.
 */
export const STRIPE_DEPLOYMENT_KEY = 'deployment'

/**
 * Every Stripe event the managed webhook endpoint subscribes to.
 *
 * `invoice.upcoming` is enabled although nothing handles it (it carries no invoice id and nothing
 * is due), so an application can observe it without a Stripe dashboard change.
 */
export const WEBHOOK_EVENTS: readonly string[] = Object.freeze([
  'checkout.session.completed', 'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed', 'checkout.session.expired',
  'customer.created', 'customer.updated', 'customer.deleted',
  'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted',
  'customer.subscription.paused', 'customer.subscription.resumed', 'customer.subscription.trial_will_end',
  'customer.subscription.pending_update_applied', 'customer.subscription.pending_update_expired',
  'invoice.paid', 'invoice.payment_failed', 'invoice.payment_action_required', 'invoice.upcoming',
  'invoice.marked_uncollectible', 'invoice.voided',
  'charge.refunded', 'refund.created', 'refund.updated', 'refund.failed',
  'charge.dispute.created', 'charge.dispute.closed', 'charge.dispute.funds_withdrawn',
  'charge.dispute.funds_reinstated',
])

export interface PaygateParams { paygate: string }
export interface ResyncResult { ok: boolean }
export interface ResyncSubscriptionsResult { scanned: number; updated: number }

const PaygateParamsSchema = schema<PaygateParams>({
  type: 'object', properties: { paygate: { type: 'string' } }, required: ['paygate'],
  additionalProperties: false,
} as JSONSchemaType<PaygateParams>)
const ResyncResultSchema = schema<ResyncResult>({
  type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'],
  additionalProperties: false,
} as JSONSchemaType<ResyncResult>)
const ResyncSubscriptionsResultSchema = schema<ResyncSubscriptionsResult>({
  type: 'object',
  properties: { scanned: { type: 'number' }, updated: { type: 'number' } },
  required: ['scanned', 'updated'],
  additionalProperties: false,
} as JSONSchemaType<ResyncSubscriptionsResult>)

const aliases = {
  base: 'payment-gate',
  webhook: 'payment-gate:webhook',
  resync: 'payment-gate:resync',
  resyncSubscriptions: 'payment-gate:resync-subscriptions',
} as const
const base = protocol(route(aliases.base, '/payment-gate', backend()), contract())

/** Embedded gateway protocol tree; the alias strings are private adapter details. */
export const paymentGate = {
  base,
  /** Public: Stripe signs the raw body, so no application guard may sit in front of it. */
  webhook: protocol(
    route(aliases.webhook, '/webhook/:paygate', backend({ parent: base, method: RouteMethod.POST })),
    contract.request({ params: PaygateParamsSchema }, typed<undefined>()),
  ),
  /** Re-sync products, prices, the portal configuration and the webhook endpoint. */
  resync: protocol(
    route(aliases.resync, '/resync', backend({ parent: base, method: RouteMethod.POST })),
    contract(ResyncResultSchema),
    { guards: GUARD_ED25519 },
  ),
  /** Re-read every live paygate subscription and apply it as a webhook would. */
  resyncSubscriptions: protocol(
    route(aliases.resyncSubscriptions, '/resync-subscriptions', backend({ parent: base, method: RouteMethod.POST })),
    contract(ResyncSubscriptionsResultSchema),
    { guards: GUARD_ED25519 },
  ),
} as const
