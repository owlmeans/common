import { toConfigRecord } from '@owlmeans/server-app'
import { plugin, PLUGIN_RECORD } from '@owlmeans/config'
import {
  assertAmountCheckoutPolicy, assertPricingPolicy, assertQuantityCheckoutPolicy, CAPABILITY_LIMIT_SCOPE,
  CheckoutPricingMode, CONSUMER_RIGHTS_RECORD_ID, CONSUMER_RIGHTS_RECORD_TYPE, ConsumerRightsError, LimitKind,
  LimitMisdeclared, LimitWindow, makeConsumerRightsPolicy, PLAN_RECORD_PREFIX, PLAN_RECORD_TYPE, PaymentError,
  PlanDuration, PlanRankConflict, PlanStatus, PRICING_POLICY_RECORD_ID, PRICING_POLICY_RECORD_TYPE,
  PRODUCT_RECORD_PREFIX, PRODUCT_RECORD_TYPE, ProductError,
} from '@owlmeans/payment'
import type { ConsumerRightsPolicy, LimitDeclaration, PlanWithdrawalComponent } from '@owlmeans/payment'
import {
  CONSUMER_RIGHTS_MAIL_PLUGIN_CONFIG, STRIPE_PAYGATE_ALIAS, STRIPE_PLUGIN_CONFIG, STRIPE_PORTAL_PLUGIN_CONFIG,
  STRIPE_PRICING_PLUGIN_CONFIG,
} from './consts.js'
import type {
  Config, ConsumerRightsDef, PaymentPlan, PaymentPlanDef, PaymentProduct, PaymentProductDef, PortalBrandingDef,
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
  const currencyPrices = currencyPricesOf(def)
  assertWithdrawalComponents(def)

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
    ...(currencyPrices != null ? { currencyPrices } : {}),
    ...(def.withdrawal != null ? { withdrawal: { components: def.withdrawal.components.map(item => ({ ...item })) } } : {}),
  }
  cfg.records.push({ ...toConfigRecord(plan), recordType: PLAN_RECORD_TYPE, id: `${PLAN_RECORD_PREFIX}:${def.sku}` })
}

const CURRENCY = /^[a-z]{3}$/

/** `currencyPrices` normalized to lowercase codes; each a positive amount of whole minor units. */
const currencyPricesOf = (def: PaymentPlanDef): Record<string, number> | undefined => {
  if (def.currencyPrices == null) {
    return undefined
  }
  if (def.pricingMode === CheckoutPricingMode.Amount || def.free === true) {
    throw new ProductError(`currency-prices:${def.sku}:mode`)
  }
  const prices: Record<string, number> = {}
  for (const [raw, amount] of Object.entries(def.currencyPrices)) {
    const currency = raw.toLowerCase()
    const minor = Math.round(amount * 100)
    if (!CURRENCY.test(currency) || !Number.isFinite(amount) || amount <= 0 || !Number.isSafeInteger(minor)
      || Math.abs(minor - amount * 100) > 1e-6 || prices[currency] != null) {
      throw new ProductError(`currency-prices:${def.sku}:${raw}`)
    }
    prices[currency] = amount
  }

  return prices
}

/** The components' shares must add up to the plan's price in minor units. */
const assertWithdrawalComponents = (def: PaymentPlanDef): void => {
  const components: PlanWithdrawalComponent[] | undefined = def.withdrawal?.components
  if (components == null) {
    return
  }
  const keys = new Set<string>()
  let sum = 0
  for (const component of components) {
    if (typeof component.key !== 'string' || component.key === '' || keys.has(component.key)
      || (component.basis !== 'time' && component.basis !== 'units')
      || !Number.isSafeInteger(component.shareMinor) || component.shareMinor < 0) {
      throw new ProductError(`withdrawal:${def.sku}:component`)
    }
    keys.add(component.key)
    sum += component.shareMinor
  }
  if (components.length === 0 || sum !== Math.round(def.price * 100)) {
    throw new ProductError(`withdrawal:${def.sku}:shares`)
  }
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

/**
 * Declare the consumer-rights policy (EU withdrawal, spend consent, start requests, cancellation,
 * country lock) — a singleton config record like the pricing policy: `DEFAULT_CONSUMER_RIGHTS`
 * filled in, asserted, and replacing any earlier declaration. It is ADVERTISED to the browser; the
 * `mail` options (mailer alias, sender, archive copies) go to a backend-only plugin config.
 *
 * `trader` (who the consumer contracts with: `name` for the statements, `legalName`/`address`/`email`
 * for the mails and the withdrawal information) is backend-only as well.
 *
 * @throws ConsumerRightsError (`policy:<field>`) — see `assertConsumerRightsPolicy`; `policy:trader`
 * when a mechanism is on and no trader `name` and `legalName` are declared.
 */
export const declareConsumerRights = (cfg: Config, def: ConsumerRightsDef): ConsumerRightsPolicy => {
  const { mail, trader, ...declaration } = def
  const policy = makeConsumerRightsPolicy(declaration)
  const anyMechanism = Object.values(policy.mechanisms).some(on => on === true)
  if (anyMechanism && (trader?.name == null || trader.name.trim() === '' || trader.legalName == null
    || trader.legalName.trim() === '')) {
    throw new ConsumerRightsError('policy:trader')
  }
  if (mail?.bcc?.some(address => !/^[^\s@]+@[^\s@]+$/.test(address)) === true) {
    throw new ConsumerRightsError('policy:mail-bcc')
  }
  cfg.records = (cfg.records ?? []).filter(record => record.id !== CONSUMER_RIGHTS_RECORD_ID)
  cfg.records.push({
    ...toConfigRecord(policy), recordType: CONSUMER_RIGHTS_RECORD_TYPE, id: CONSUMER_RIGHTS_RECORD_ID,
  })
  const plugins = (cfg as unknown as Record<string, Array<{ id?: string }> | undefined>)[PLUGIN_RECORD]
  if (plugins != null) {
    (cfg as unknown as Record<string, unknown>)[PLUGIN_RECORD] = plugins
      .filter(record => record.id !== CONSUMER_RIGHTS_MAIL_PLUGIN_CONFIG)
  }
  if (mail != null || trader != null) {
    plugin(cfg, {
      ...(trader != null ? {
        trader: {
          name: trader.name.trim(), legalName: trader.legalName.trim(),
          ...(trader.address != null && trader.address.trim() !== '' ? { address: trader.address.trim() } : {}),
          ...(trader.email != null && trader.email.trim() !== '' ? { email: trader.email.trim() } : {}),
          ...(trader.website != null && trader.website.trim() !== '' ? { website: trader.website.trim() } : {}),
        },
      } : {}),
      ...(mail?.alias != null ? { alias: mail.alias } : {}),
      ...(mail?.from != null ? { from: mail.from } : {}),
      ...(mail?.replyTo != null ? { replyTo: mail.replyTo } : {}),
      ...(mail?.bcc != null && mail.bcc.length > 0 ? { bcc: [...mail.bcc] } : {}),
    }, CONSUMER_RIGHTS_MAIL_PLUGIN_CONFIG)
  }

  return policy
}
