import type Stripe from 'stripe'
import type { SubscriptionStatus } from '@owlmeans/payment'
import type { CommitResult, SubscriptionRef } from '../../types.js'

export interface ApplyOptions {
  source: 'webhook' | 'resync'
  eventId?: string
  /** `event.created` (epoch seconds) of a webhook payload; an older payload than the stored state is skipped. */
  eventCreated?: number
  renewal?: boolean
  invoiceId?: string
  trialEnding?: boolean
  /** Store this status whatever the payload says (a deleted subscription is canceled). */
  forced?: SubscriptionStatus
  /** The paygate client — lets the first commit read the first invoice for its purchase row. */
  stripe?: Stripe
}

/** Stripe subscriptions applied to a context's subscription rows. */
export interface StripeSubscriptionsHelper {
  /**
   * Apply one Stripe subscription — from a webhook payload or a fresh retrieval — to its row, and
   * tell observers what changed. Shared by every webhook and by resync.
   */
  applySubscription: (subscription: Stripe.Subscription, opts: ApplyOptions) => Promise<CommitResult>
  /** A subscription by id, or `null` when Stripe no longer has it. */
  retrieveSubscription: (stripe: Stripe, id: string) => Promise<Stripe.Subscription | null>
  /** A row whose paygate subscription no longer exists is canceled (observers hear `canceled`). */
  cancelMissing: (externalId: string) => Promise<CommitResult>
  /**
   * Re-read paygate subscriptions — one by id, or every row of one entity — and apply each as a
   * webhook would. A subscription the paygate no longer has is canceled.
   *
   * @returns how many rows changed
   */
  resyncStripeSubscription: (stripe: Stripe, ref: SubscriptionRef) => Promise<number>
  /** Resync every paygate subscription that is not already terminal. Errors per row are logged. */
  resyncStripeSubscriptions: (stripe: Stripe) => Promise<{ scanned: number, updated: number }>
}
