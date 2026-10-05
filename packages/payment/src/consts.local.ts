import { CONSUMER_RIGHTS_RECORD_TYPE, L10N_RECORD_TYPE, PLAN_RECORD_TYPE, PRICING_POLICY_RECORD_TYPE, PRODUCT_RECORD_TYPE } from './consts.js'

/**
 * The pricing policy record carries only flags and TTLs (never a Stripe secret, an API version, or
 * a migration switch — those stay in a backend-only plugin), so advertising it to the browser is
 * safe. The consumer-rights policy record carries only public links, territories and switches
 * (the mail options — sender, archive copy — stay in a backend-only plugin config), so the browser
 * renders the same links and switches the server enforces.
 */
export const advertisedRecordTypes = new Set([
  L10N_RECORD_TYPE, PLAN_RECORD_TYPE, PRODUCT_RECORD_TYPE, PRICING_POLICY_RECORD_TYPE, CONSUMER_RIGHTS_RECORD_TYPE,
])

export const CAPABILITY_REQUIRED_MARKER = 'capability-required:'

export const LIMIT_EXHAUSTED_MARKER = 'limit-exhausted:'

export const LIMIT_EXHAUSTED_FIELDS = /^(.*):([^:/]+)\/([^:/]+)(?::(.+))?$/

export const PERFORMANCE_CONSENT_MARKER = 'performance-consent-required:'

export const SUBSCRIPTION_START_MARKER = 'subscription-start-required:'

export const BILLING_COUNTRY_LOCKED_MARKER = 'billing-country-locked:'

export const WITHDRAWAL_UNAVAILABLE_MARKER = 'withdrawal-unavailable:'

export const CANCELLATION_UNAVAILABLE_MARKER = 'cancellation-unavailable:'

export const CHECKOUT_LIMIT_MARKER = 'checkout-limit-exceeded:'

export const PLAN_DATES = ['subscribedAt', 'periodStart', 'periodEnd', 'trialEnd', 'pausedAt'] as const

export const LIMIT_DATES = ['windowStart', 'resetsAt'] as const
