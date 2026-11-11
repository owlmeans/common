import { INTERNAL_PAYGATE, LIMIT_GATE } from '@owlmeans/payment'
export { INTERNAL_PAYGATE, LIMIT_GATE }

/** The payment providers registered in a context (`ensurePaymentProviders`) — a lazy service. */
export const PAYMENT_PROVIDERS = 'payment-providers'
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
/** An organization's entitlement grants: extra units of a limit, or a capability, beside its plan. */
export const RES_PAYMENT_GRANT = 'payment-grant'

/** What an entitlement grant gives: counted units of one limit, or one capability. */
export enum EntitlementGrantKind {
  Units = 'units',
  Capability = 'capability',
}

/**
 * An entitlement grant's lifecycle. A grant is `active` until it is revoked; its `startsAt` /
 * `endsAt` are read at read time, so an expired grant stays `active` and is simply out of force.
 */
export enum EntitlementGrantStatus {
  Active = 'active',
  Revoked = 'revoked',
}

/** The usage window of a unit held on an entitlement grant: `grant:<grantId>` — never a counter window. */
export const GRANT_WINDOW_PREFIX = 'grant:'

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

/** How far back `reconcile` looks for completed checkouts that have no purchase row. */
export const PURCHASE_BACKFILL_DAYS = 16

/** Top-level domains that never receive mail (RFC 2606 / 6761) — e2e addresses are recorded as skipped. */
export const RESERVED_MAIL_TLDS: readonly string[] = Object.freeze(['test', 'example', 'invalid', 'localhost'])

/**
 * The contract reference alphabet: digits and capitals without the look-alikes 0/O, 1/I/L, so a
 * reference read aloud or typed from paper is never ambiguous.
 */
export const CONTRACT_REF_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
