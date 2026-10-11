import type { PermissionSet } from '@owlmeans/auth'
import type { EffectivePlan, PaymentPlan, PaymentProduct } from '../types.js'

/** The catalogue a context declares, and the plan each entity holds in it. */
export interface CatalogueHelper {
  /** A plan by sku, or `null` when the catalogue no longer declares it. */
  findPlan: (planSku: string) => Promise<PaymentPlan | null>
  /** A product by sku, or `null`. */
  findProduct: (productSku: string) => Promise<PaymentProduct | null>
  /** Every plan of every declared product. */
  catalogPlans: () => Promise<PaymentPlan[]>
  /** The declared free plan an entity falls back to: the lowest rank, then the sku. */
  freePlanOf: () => Promise<PaymentPlan | null>
  /**
   * The plan an entity holds: its highest-ranked subscription in an entitling status (the catalogue
   * rank, the stored one for a plan the catalogue no longer declares; the newest first on a tie),
   * else the declared free plan. The plan answered carries the winning row's `overrides`
   * (`overriddenPlan`), so every reader — ceilings, the view, the gates — sees one answer.
   *
   * @throws PlanRequired when there is neither.
   */
  resolveEffectivePlan: (entityId: string, at?: Date) => Promise<EffectivePlan>
  /**
   * The capability sets an entity's effective plan grants now — sets behind a lapsed promo left out.
   * Empty when the plan is not of one of `productSkus`.
   */
  entitlementsOf: (entityId: string, productSkus?: string[]) => Promise<PermissionSet[]>
  /** Every product sold through Stripe with the plans it sells there. */
  stripePlansOf: () => Promise<Array<{ product: PaymentProduct, plans: PaymentPlan[] }>>
  /** The plan an amount/quantity checkout of a consumable product sells: the named one, else the first. */
  consumablePlanOf: (productSku: string, planSku?: string) => Promise<{ product: PaymentProduct, plan: PaymentPlan }>
}
