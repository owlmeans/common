import type Stripe from 'stripe'
import { SubscriptionStatus } from '@owlmeans/payment'

/**
 * Stripe's subscription status as a `SubscriptionStatus`. `past_due` still entitles (flagged);
 * `unpaid`, `paused` and paused collection revoke until resumed.
 */
export const mapStatus = (subscription: Pick<Stripe.Subscription, 'status' | 'pause_collection'>): SubscriptionStatus => {
  switch (subscription.status) {
    case 'active':
      return subscription.pause_collection != null ? SubscriptionStatus.Suspended : SubscriptionStatus.Active
    case 'trialing':
      return subscription.pause_collection != null ? SubscriptionStatus.Suspended : SubscriptionStatus.Trial
    case 'past_due': return SubscriptionStatus.PastDue
    case 'unpaid': return SubscriptionStatus.Suspended
    case 'paused': return SubscriptionStatus.Suspended
    case 'incomplete': return SubscriptionStatus.Created
    case 'incomplete_expired': return SubscriptionStatus.Ended
    case 'canceled': return SubscriptionStatus.Canceled
    default: return SubscriptionStatus.Created
  }
}
