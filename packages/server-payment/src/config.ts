import { toConfigRecord } from '@owlmeans/server-app'
import { plugin } from '@owlmeans/config'
import {
  assertAmountCheckoutPolicy, assertPricingPolicy, assertQuantityCheckoutPolicy, CAPABILITY_LIMIT_SCOPE,
  CheckoutPricingMode, LimitKind, LimitMisdeclared, LimitWindow, PLAN_RECORD_PREFIX, PLAN_RECORD_TYPE,
  PaymentError, PlanDuration, PlanRankConflict, PlanStatus, PRICING_POLICY_RECORD_ID, PRICING_POLICY_RECORD_TYPE,
  PRODUCT_RECORD_PREFIX, PRODUCT_RECORD_TYPE,
} from '@owlmeans/payment'
import type { LimitDeclaration } from '@owlmeans/payment'
import {
  STRIPE_PAYGATE_ALIAS, STRIPE_PLUGIN_CONFIG, STRIPE_PORTAL_PLUGIN_CONFIG, STRIPE_PRICING_PLUGIN_CONFIG,
} from './consts.js'
import type {
  Config, PaymentPlan, PaymentPlanDef, PaymentProduct, PaymentProductDef, PortalBrandingDef,
  PricingDef, StripeSecretsDef,
} from './types.js'

export const declarePaymentProduct = (cfg: Config, def: PaymentProductDef): void => {
  cfg.records = cfg.records ?? []
  const product: PaymentProduct = {
    type: def.type, sku: def.sku, title: def.name, description: def.description,
    defaultLng: def.defaultLng ?? 'en', services: def.services,
    gateways: def.gateways ?? [STRIPE_PAYGATE_ALIAS], capabilities: def.capabilities,
    taxCode: def.taxCode, unitLabel: def.unitLabel,
  }
  cfg.records.push({ ...toConfigRecord(product), recordType: PRODUCT_RECORD_TYPE, id: `${PRODUCT_RECORD_PREFIX}:${def.sku}` })
}

const isSafeCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

const LIMIT_KINDS = Object.values(LimitKind) as string[]
const LIMIT_WINDOWS = Object.values(LimitWindow) as string[]

const assertLimitDeclaration = (key: string, limit: LimitDeclaration): void => {
  if (!LIMIT_KINDS.includes(limit.kind)) {
    throw new LimitMisdeclared(`${key}:kind`)
  }
  if (limit.kind === LimitKind.Window) {
    if (limit.window == null) {
      throw new LimitMisdeclared(`${key}:window-missing`)
    }
    if (!LIMIT_WINDOWS.includes(limit.window)) {
      throw new LimitMisdeclared(`${key}:window`)
    }
  } else if (limit.window != null) {
    throw new LimitMisdeclared(`${key}:window-forbidden`)
  }
  if (!isSafeCount(limit.limit)) {
    throw new LimitMisdeclared(`${key}:limit`)
  }
  if (limit.promo != null && !(limit.promo.until instanceof Date && !Number.isNaN(limit.promo.until.getTime()))) {
    throw new LimitMisdeclared(`${key}:promo-until`)
  }
}

/**
 * Declare a plan into the configuration catalogue.
 *
 * Validated before anything is pushed: `rank` a safe integer `>= 0`; a `free` plan costs nothing
 * and is sold through no gateway; no capability set under the reserved `limit` scope; every limit
 * well-formed (a `window` limit names its window, the others do not, the ceiling is a safe
 * integer, a promo ends at a real `Date`). Amount and quantity policies are asserted as before.
 */
export const declarePaymentPlan = (cfg: Config, def: PaymentPlanDef): void => {
  if (def.rank != null && !isSafeCount(def.rank)) {
    throw new PlanRankConflict(`rank:${def.sku}`)
  }
  if (def.free === true && (def.price !== 0 || (def.gateways ?? []).length > 0)) {
    throw new PlanRankConflict(`free:${def.sku}`)
  }
  if ((def.capabilities ?? []).some(set => set.scope === CAPABILITY_LIMIT_SCOPE)) {
    throw new LimitMisdeclared(`${def.sku}:reserved-scope`)
  }
  for (const [key, limit] of Object.entries(def.limits ?? {})) {
    assertLimitDeclaration(key, limit)
  }

  const pricingMode = def.pricingMode
  if (pricingMode === CheckoutPricingMode.Amount) {
    if (def.amountPolicy == null) throw new TypeError(`Amount checkout plan '${def.sku}' requires amountPolicy`)
    assertAmountCheckoutPolicy(def.amountPolicy)
  }
  const quantityPolicy = def.quantityPolicy ?? (
    def.minQuantity != null || def.maxQuantity != null || def.defaultQuantity != null
      ? {
        minimum: def.minQuantity ?? 1,
        maximum: def.maxQuantity ?? Math.max(100_000, def.minQuantity ?? 1),
        default: def.defaultQuantity ?? def.minQuantity ?? 1,
      }
      : undefined
  )
  if (quantityPolicy != null) assertQuantityCheckoutPolicy(quantityPolicy)

  cfg.records = cfg.records ?? []
  const plan: PaymentPlan = {
    productSku: def.productSku, sku: def.sku, status: PlanStatus.Active,
    ...(def.rank != null ? { rank: def.rank } : {}),
    ...(def.free === true ? { free: true, gateways: [] } : def.gateways != null ? { gateways: def.gateways } : {}),
    duration: def.duration, price: def.price, currency: def.currency ?? def.amountPolicy?.currency ?? 'usd',
    order: def.order ?? 0, title: def.title ?? def.sku, capabilities: def.capabilities,
    limits: def.limits, recurring: def.recurring, pricingMode, amountPolicy: def.amountPolicy,
    quantityPolicy,
    minQuantity: quantityPolicy?.minimum, maxQuantity: quantityPolicy?.maximum,
    defaultQuantity: quantityPolicy?.default,
  }
  cfg.records.push({ ...toConfigRecord(plan), recordType: PLAN_RECORD_TYPE, id: `${PLAN_RECORD_PREFIX}:${def.sku}` })
}

/** Every plan declared into a configuration. */
export const declaredPlansOf = (cfg: Config): PaymentPlan[] =>
  (cfg.records ?? []).filter(record => record.recordType === PLAN_RECORD_TYPE) as unknown as PaymentPlan[]

/**
 * Cross-plan rules a single declaration cannot see:
 *
 * - at most one free plan per rank;
 * - no two paid plans of one product at the same rank (one-time `consumable` plans are never an
 *   entity's plan and are not ranked against each other).
 *
 * A limit key MAY change kind between plans (lifetime on one, a monthly window on another): counters
 * are keyed by `(entity, key, window)` and the window is derived from the kind, so each kind keeps its
 * own counter and a lifetime count still sticks to the entity across plan changes.
 *
 * @throws PlanRankConflict
 */
export const assertPlanDeclarations = (cfg: Config): void => {
  const plans = declaredPlansOf(cfg)
  const freeRanks = new Set<number>()
  const paidRanks = new Set<string>()
  for (const plan of plans) {
    const rank = plan.rank ?? 0
    if (plan.free === true) {
      if (freeRanks.has(rank)) {
        throw new PlanRankConflict(`free:${rank}`)
      }
      freeRanks.add(rank)
    } else if (plan.duration !== PlanDuration.Consumable) {
      const key = `${plan.productSku}:${rank}`
      if (paidRanks.has(key)) {
        throw new PlanRankConflict(key)
      }
      paidRanks.add(key)
    }
  }
}

/**
 * Where the Stripe secrets live. A value that looks like a path is read into the configuration at
 * boot. The webhook secret is an optional override of the one the managed endpoint stores.
 */
export const stripeSecrets = (cfg: Config, paths: StripeSecretsDef): void => {
  plugin(cfg, {
    api: paths.api, ...(paths.webhook != null && paths.webhook !== '' ? { webhook: paths.webhook } : {}),
  }, STRIPE_PLUGIN_CONFIG)
}

/** Branding and the default return URL of the managed customer portal configuration. */
export const portalBranding = (cfg: Config, def: PortalBrandingDef): void => {
  plugin(cfg, {
    returnUrl: def.returnUrl,
    ...(def.headline != null ? { headline: def.headline } : {}),
    ...(def.privacyPolicyUrl != null ? { privacyPolicyUrl: def.privacyPolicyUrl } : {}),
    ...(def.termsOfServiceUrl != null ? { termsOfServiceUrl: def.termsOfServiceUrl } : {}),
  }, STRIPE_PORTAL_PLUGIN_CONFIG)
}

/**
 * Declare the pricing policy: whether checkout collects tax and a VAT/GST id, what `tax_behavior`
 * synced prices are given, Adaptive Pricing, and whether the estimate endpoints are served. A
 * config never carries more than one — a second call replaces the first, so re-declaring (a test, a
 * config module re-run) is safe rather than silently ignored (a config resource resolves an id to
 * its FIRST match).
 *
 * `def.stripe` (the FX Quotes preview version, the unspecified-price migration switch) is
 * Stripe-only and goes to a backend plugin, never the advertised `PricingPolicy` record.
 *
 * @throws PaymentError (`assertPricingPolicy`) when an estimate is declared without the tax or
 * currency capability it requires.
 */
export const declarePaymentPricing = (cfg: Config, def: PricingDef): void => {
  const { stripe, ...policy } = def
  assertPricingPolicy(policy)
  cfg.records = (cfg.records ?? []).filter(record => record.id !== PRICING_POLICY_RECORD_ID)
  cfg.records.push({
    ...toConfigRecord(policy), recordType: PRICING_POLICY_RECORD_TYPE, id: PRICING_POLICY_RECORD_ID,
  })
  if (stripe != null) {
    const settlementCurrency = stripe.settlementCurrency?.toLowerCase()
    if (settlementCurrency != null && !/^[a-z]{3}$/.test(settlementCurrency)) {
      throw new PaymentError('pricing-policy:settlement-currency')
    }
    const subscriptionPaymentMethodTypes = stripe.subscriptionPaymentMethodTypes?.map(type => type.toLowerCase())
    if (subscriptionPaymentMethodTypes != null && (subscriptionPaymentMethodTypes.length === 0
      || subscriptionPaymentMethodTypes.some(type => !/^[a-z][a-z0-9_]*$/.test(type))
      || new Set(subscriptionPaymentMethodTypes).size !== subscriptionPaymentMethodTypes.length)) {
      throw new PaymentError('pricing-policy:subscription-payment-methods')
    }
    plugin(cfg, {
      ...stripe,
      ...(settlementCurrency != null ? { settlementCurrency } : {}),
      ...(subscriptionPaymentMethodTypes != null ? { subscriptionPaymentMethodTypes } : {}),
    }, STRIPE_PRICING_PLUGIN_CONFIG)
  }
}
