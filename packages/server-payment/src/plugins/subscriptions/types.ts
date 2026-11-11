import type { SubscriptionStatus } from '@owlmeans/payment'
import type { CommitResult, SubscriptionRef } from '../../types.js'
import type { Paygate, PaygateSubscription } from '../../paygate/types.js'

export interface ApplyOptions {
  source: 'webhook' | 'resync'
  eventId?: string
  /** When the paygate produced the event; an older payload than the stored state is skipped. */
  eventCreated?: Date
  renewal?: boolean
  invoiceId?: string
  trialEnding?: boolean
  /** Store this status whatever the payload says (a deleted subscription is canceled). */
  forced?: SubscriptionStatus
}

/** Paygate subscriptions applied to a context's subscription rows. */
export interface PaygateSubscriptionsHelper {
  /**
   * Apply one paygate subscription — from a webhook payload or a fresh retrieval — to its row, and
   * tell observers what changed. Shared by every webhook and by resync. The first commit of a
   * subscription writes its purchase before the `created` observers hear it.
   */
  applySubscription: (paygate: Paygate, subscription: PaygateSubscription, opts: ApplyOptions) => Promise<CommitResult>
  /** A subscription by id, or `null` when the paygate no longer has it (or keeps no subscriptions). */
  retrieveSubscription: (paygate: Paygate, id: string) => Promise<PaygateSubscription | null>
  /** A row whose paygate subscription no longer exists is canceled (observers hear `canceled`). */
  cancelMissing: (paygate: Paygate, externalId: string) => Promise<CommitResult>
  /**
   * Re-read paygate subscriptions — one by id, or every paygate row of one entity — and apply each as
   * a webhook would. A subscription the paygate no longer has is canceled; a row of a paygate that is
   * not registered, or keeps no subscriptions, is skipped.
   *
   * @returns how many rows changed
   */
  resyncSubscription: (ref: SubscriptionRef) => Promise<number>
  /** Resync every paygate subscription that is not already terminal. Errors per row are logged. */
  resyncAll: () => Promise<{ scanned: number, updated: number }>
}
