import { CheckoutPricingMode, LimitKind, LimitWindow, PlanDuration, ProductType, type PlanCapability } from '@owlmeans/payment'
import { declarePaymentPlan, declarePaymentProduct, type Config } from '@owlmeans/server-payment'
import { CREDIT_UNIT, CREDITS_PRODUCT, DAY_MS, FREE, PLANS_PRODUCT, PRO, SERVICE, TEAM } from './consts.js'
import type { CatalogueOptions } from './types.js'

/** An instant `days` from now. */
export const future = (days = 30): Date => new Date(Date.now() + days * DAY_MS)
/** An instant `days` ago. */
export const past = (days = 30): Date => new Date(Date.now() - days * DAY_MS)

/**
 * The catalogue fixture: an amount-priced credits product (USD, 2% + 0 fee) and a plans product with a
 * free plan (`seats`, `exports`, `reports` limits, a `feature:preview` promo), a pro and a team plan
 * (monthly, ranks 10 and 20) — plus `opts.plans`.
 */
export const declareTestCatalogue = (cfg: Config, opts: CatalogueOptions = {}): void => {
  declarePaymentProduct(cfg, {
    sku: CREDITS_PRODUCT, type: ProductType.Consumable, services: [SERVICE], name: 'Credits',
  })
  declarePaymentPlan(cfg, {
    productSku: CREDITS_PRODUCT, sku: CREDIT_UNIT, duration: PlanDuration.Consumable, price: 0.02,
    pricingMode: CheckoutPricingMode.Amount,
    amountPolicy: {
      currency: 'usd', minimumMinor: 500, maximumMinor: 50_000, defaultMinor: 1_000,
      presetsMinor: [1_000, 2_000, 5_000, 10_000], fixedMinor: 0, rateBps: 200,
    },
  })
  declarePaymentProduct(cfg, {
    sku: PLANS_PRODUCT, type: ProductType.Service, services: [SERVICE], name: 'Plans',
  })
  if (opts.free !== false) {
    declarePaymentPlan(cfg, {
      productSku: PLANS_PRODUCT, sku: FREE, duration: PlanDuration.Monthly, rank: 0, free: true, price: 0,
      capabilities: [
        { scope: 'feature', permissions: { basic: true } },
        { scope: 'feature', permissions: { preview: true }, promo: { until: opts.previewUntil ?? future() } },
      ] satisfies PlanCapability[],
      limits: {
        seats: { kind: LimitKind.Occupancy, limit: 0 },
        exports: { kind: LimitKind.Window, window: LimitWindow.Month, limit: 1 },
        reports: { kind: LimitKind.Lifetime, limit: 1 },
      },
    })
  }
  declarePaymentPlan(cfg, {
    productSku: PLANS_PRODUCT, sku: PRO, duration: PlanDuration.Monthly, rank: 10, price: 20,
    recurring: { interval: 'month' },
    capabilities: [{ scope: 'feature', permissions: { basic: true, whitelabel: true, preview: true } }],
    limits: {
      seats: { kind: LimitKind.Occupancy, limit: 2 },
      exports: { kind: LimitKind.Window, window: LimitWindow.Day, limit: 3 },
      reports: {
        kind: LimitKind.Lifetime, limit: 4, promo: { until: opts.reportsUntil ?? future(), grandfather: true },
      },
    },
  })
  declarePaymentPlan(cfg, {
    productSku: PLANS_PRODUCT, sku: TEAM, duration: PlanDuration.Monthly, rank: 20, price: 50,
    recurring: { interval: 'month' },
    capabilities: [{ scope: 'feature', permissions: { basic: true, whitelabel: true, preview: true } }],
    limits: {
      seats: { kind: LimitKind.Occupancy, limit: 10 },
      exports: { kind: LimitKind.Window, window: LimitWindow.Day, limit: 30 },
      reports: { kind: LimitKind.Lifetime, limit: 40 },
    },
  })
  for (const plan of opts.plans ?? []) {
    declarePaymentPlan(cfg, plan)
  }
}
