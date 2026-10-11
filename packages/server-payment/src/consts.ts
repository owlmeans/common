import { INTERNAL_PAYGATE, LIMIT_GATE } from '@owlmeans/payment'
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
/**
 * The Stripe API version every client of this package is pinned to (the one stripe-node 17 defaulted to).
 * Moving it re-creates the stored webhook endpoints with their payload shapes, so it moves together with
 * the readers of `current_period_*`, an invoice's subscription and a credit note's refund.
 */
export const STRIPE_PINNED_API_VERSION = '2025-02-24.acacia'

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

/** One per organization: the billing country fixed at the first purchase. */
export const RES_BILLING_PROFILE = 'payment-billing-profile'
/** One per paid checkout (a top-up, a subscription's first invoice): the contract and its window. */
export const RES_PAYMENT_PURCHASE = 'payment-purchase'
/** Append-only: express consents to early performance and subscription start requests. */
export const RES_CONSUMER_CONSENT = 'payment-consumer-consent'
/** Append-only: withdrawal and cancellation declarations. */
export const RES_CONSUMER_DECLARATION = 'payment-consumer-declaration'
/** Append-only: every execution and audit step of the consumer-rights flows. */
export const RES_CONSUMER_EVENT = 'payment-consumer-event'

export const CONSUMER_RIGHTS_SERVICE = 'payment-consumer-rights'
/** The consumer-rights mail options (trader, sender, archive copies) — never advertised. */
export const CONSUMER_RIGHTS_MAIL_PLUGIN_CONFIG = '_external:payment-consumer-mail'

/** Stripe's own bounds of a Checkout Session's `expires_at`, from now. */
export const STRIPE_SESSION_TTL_MIN_SECONDS = 30 * 60
export const STRIPE_SESSION_TTL_MAX_SECONDS = 24 * 60 * 60

/** How far back `reconcile` looks for completed sessions that have no purchase row. */
export const PURCHASE_BACKFILL_DAYS = 16

/** Top-level domains that never receive mail (RFC 2606 / 6761) — e2e addresses are recorded as skipped. */
export const RESERVED_MAIL_TLDS: readonly string[] = Object.freeze(['test', 'example', 'invalid', 'localhost'])

/** The purchase id prefix of a Stripe purchase: `stripe:<session id>` or `stripe:<subscription id>`. */
export const PURCHASE_ID_PREFIX = 'stripe'

/**
 * The contract reference alphabet: digits and capitals without the look-alikes 0/O, 1/I/L, so a
 * reference read aloud or typed from paper is never ambiguous.
 */
export const CONTRACT_REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

/** Fingerprint sku prefix of a portal configuration: `portal:<owner>` (the gateway's `owner`). */
export const FINGERPRINT_PORTAL = 'portal'

/**
 * The metadata every Stripe object this package creates carries (`{ owlmeans: 'payment', service }`,
 * `service` valued with the gateway's `owner`). It labels the object for an operator; several
 * deployments of one owner share it, so it never decides on its own that an object belongs to this
 * deployment.
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
