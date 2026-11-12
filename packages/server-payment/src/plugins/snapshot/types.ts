import type { CheckoutSnapshot } from '../../paygate/types.js'

/** What a completed checkout session alone decides — pure. */
export interface CheckoutSnapshotHelper {
  /**
   * Whether a one-time checkout is fulfilled: a paid payment (a zero total only outside amount mode),
   * or a completed amount checkout fully covered by promotion codes — a positive subtotal discounted
   * to a zero total with no tax, the codes enabled on the session.
   */
  canFulfill: (session: CheckoutSnapshot) => boolean
}
