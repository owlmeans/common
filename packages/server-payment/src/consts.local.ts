import { LimitKind, LimitWindow, SubscriptionStatus } from '@owlmeans/payment'
import { DateSchema } from '@owlmeans/auth'
import type { PaymentSubscriptionRecord, SubscriptionChange } from './types.js'

export const LIMIT_KINDS = Object.values(LimitKind) as string[]

export const LIMIT_WINDOWS = Object.values(LimitWindow) as string[]

export const CURRENCY = /^[a-z]{3}$/

export const aliases = {
  base: 'payment-gate',
  webhook: 'payment-gate:webhook',
  resync: 'payment-gate:resync',
  resyncSubscriptions: 'payment-gate:resync-subscriptions',
} as const

export const str = { type: 'string' } as const

export const optStr = { type: 'string', nullable: true } as const

export const num = { type: 'number' } as const

export const optNum = { type: 'number', nullable: true } as const

export const optBool = { type: 'boolean', nullable: true } as const

export const date = DateSchema

export const id = { type: 'string', nullable: true } as const

/** The request evidence every consumer act carries (`RequestOrigin`). */
export const origin = {
  ip: optStr, forwardedFor: optStr, userAgent: optStr, ipCountry: optStr, acceptLanguage: optStr, via: optStr,
} as const

export const links = {
  type: 'object',
  properties: {
    billingTerms: str, withdrawalInformation: optStr, withdrawalForm: optStr, withdrawalFunction: optStr,
    cancellation: optStr,
  },
  required: ['billingTerms'],
  additionalProperties: false,
} as const

export const ENDED: readonly SubscriptionStatus[] = [SubscriptionStatus.Canceled, SubscriptionStatus.Ended]

export const MATERIAL: Array<keyof PaymentSubscriptionRecord> = [
  'entityId', 'planSku', 'productSku', 'service', 'itemId', 'priceId', 'status', 'externalStatus', 'rank',
  'periodStart', 'periodEnd', 'cancelAtPeriodEnd', 'canceledAt', 'endedAt', 'pausedAt', 'trialEnd',
  'latestInvoiceId', 'customerId',
]

/** The log event of a change observers were told about; every other change is `subscription.updated`. */
export const SUBSCRIPTION_LOG_EVENTS: Partial<Record<SubscriptionChange, string>> = {
  created: 'subscription.started', renewed: 'subscription.renewed', canceled: 'subscription.canceled',
}

export const DAY_WINDOW = /^(\d{4})-(\d{2})-(\d{2})$/

export const MONTH_WINDOW = /^(\d{4})-(\d{2})$/
