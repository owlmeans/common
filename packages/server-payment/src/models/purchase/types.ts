import type { PurchaseView } from '@owlmeans/payment'
import type { PurchaseRecord, PurchaseRef } from '../../types.js'

/** One purchase and its withdrawal window. */
export interface PurchaseModel {
  readonly record: PurchaseRecord
  /** Inside its window at `at`: in scope, before the deadline, neither withdrawn from nor refunded. */
  windowOpen: (at?: Date) => boolean
  /** The purchase as the wire sees it. */
  view: (withdrawable: boolean) => PurchaseView
  /** What a usage meter is told about the purchase. */
  ref: () => PurchaseRef
}
