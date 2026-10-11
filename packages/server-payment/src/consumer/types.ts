import type { ServerProtocolEntrypoint } from '@owlmeans/server-entrypoint'
import type { EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import type {
  ConsumerRightsAccountProtocols, ConsumerRightsPublicProtocols, WithdrawalEstimate,
} from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import type Stripe from 'stripe'
import type {
  PurchaseRecord, BillingProfileRecord, BillingProfileSource, LockOptions, UsageMeter, UsageReading,
} from '../types.js'

/** What a completed Checkout Session says about its buyer and totals. */
export interface SessionEvidence {
  country?: string
  email?: string
  name?: string
  business?: boolean
  currency: string
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
  presentmentCurrency?: string
  presentmentAmountMinor?: number
  termsAccepted?: boolean
}

/** What an invoice adds to a purchase: its number, its line and the payment behind it. */
export interface InvoiceEvidence {
  invoiceNumber?: string
  invoiceLineId?: string
  paymentIntentId?: string
  country?: string
  subtotalMinor?: number
  taxMinor?: number
  totalMinor?: number
  currency?: string
}

export interface CapturedPurchase {
  purchase: PurchaseRecord
  created: boolean
}

export type Bound = ServerProtocolEntrypoint<EntrypointProtocolDeclaration>

/** The protocol tree `makeConsumerRightsProtocols` builds, with or without its public subtree. */
export interface ConsumerRightsTree extends ConsumerRightsAccountProtocols { public?: ConsumerRightsPublicProtocols }

export interface LockInput extends LockOptions {
  entityId: string
  country: string
  source: BillingProfileSource
}

export interface LockResult {
  record: BillingProfileRecord
  created: boolean
  /** The lock exists with another country: recorded as `lock-mismatch`, never relocked. */
  mismatch: boolean
}

export interface PurchaseDraft extends Omit<PurchaseRecord, 'id' | 'contractRef' | 'createdAt'> {}

export interface ConsumerRightsInternals {
  readonly managed: boolean
  meter: () => UsageMeter | null
  stripe: (ctx: ApiContext) => Promise<Stripe>
}

/** Who hands a registration its options: the application itself, or the gateway on its behalf. */
export type ConsumerRightsRegistrar = 'application' | 'gateway'

/** What a withdrawal of one purchase reimburses, as computed at one instant. */
export interface WithdrawalComputation {
  reading: UsageReading
  /** Gross, tax included — what is refunded. */
  refundMinor: number
  /** Net of tax — the credit note's line amount. */
  netMinor: number
  estimate: WithdrawalEstimate
  /** The units the deduction counts: used after consent, plus settled debt and earlier claw-backs. */
  deducted: number
  /** What the application takes back from the balance: the purchase's units still unused. */
  unitsReturned: number
}

export interface WithdrawalExecution {
  /** Every paygate step succeeded (or had nothing to do). */
  ok: boolean
  refundId?: string
  creditNoteId?: string
  refundedMinor: number
  subscriptionCanceled: boolean
  /** A step can never succeed without an operator (no payment to refund). */
  needsReview: boolean
}
