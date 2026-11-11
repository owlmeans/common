import type { PlanPriceView } from '@owlmeans/payment'
import type { Paygate } from '../paygate/types.js'

/** The catalogue of a context as each paygate's products and reusable prices. */
export interface ProductSyncHelper {
  /**
   * Synchronize every product with a plan sold through the paygate, and those plans, to the
   * paygate's catalogue (`paygate.catalogue.syncProduct`). A product whose declaration fingerprint is
   * unchanged makes no paygate call; free plans and plans sold through other paygates are never
   * synchronized; a paygate without `catalogue` is skipped. A recurring or quantity plan whose
   * catalogue currency differs from the paygate's settlement currency is converted at its FX reference
   * rate (rounded up).
   *
   * The declared `PricingPolicy.tax.behavior` (absent by default) is applied by the paygate to a
   * matching price it can still change, and to a fresh one on creation; a price carrying the
   * OPPOSITE behavior is replaced, same as any other mismatch. Each sync stores the product's
   * `prices[]` on its fingerprint row — what `planPrices`, checkout currency forcing and the estimate
   * read. The fingerprint row is keyed by the product sku: one paygate syncs a product's catalogue.
   */
  syncProducts: (paygate: Paygate) => Promise<void>
  /**
   * The prices a product's plans are charged at, per currency, as the last sync stored them — no
   * paygate call, so it works in an unmanaged process. One entry for each price's default currency
   * (`default: true`) and one per further currency.
   */
  syncedPlanPrices: (productSku: string) => Promise<PlanPriceView[]>
  /** `syncProducts` for every registered paygate. */
  syncPaymentProducts: () => Promise<void>
}
