import type { PaymentPlanDef } from '@owlmeans/server-payment'

export interface CatalogueOptions {
  /** Declare the free plan (default true). */
  free?: boolean
  /** Until when the `feature:preview` promo of the free plan runs (default: in 30 days). */
  previewUntil?: Date
  /** Until when the `reports` promo of the pro plan runs (default: in 30 days). */
  reportsUntil?: Date
  /** Extra plans. */
  plans?: PaymentPlanDef[]
}
