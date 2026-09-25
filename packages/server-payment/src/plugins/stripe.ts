import type Stripe from 'stripe'
import {
  assertCheckoutAmount, billingLanguageOf, BillingCountryLocked, chargeAmountMinor, chargeCurrencyOf,
  CheckoutPricingMode, CONSUMER_RIGHTS_COPY_VERSION, ConsumerRightsError, consumerText, inScope, linksOf,
  PaygateError, ProductError, ProductType, regionOf, TaxBehavior, WebhookSetupError,
} from '@owlmeans/payment'
import type { BillingProfileView, ConsumerRegion, ConsumerRightsPolicy, PricingPolicy } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_PAYGATE_ALIAS, STRIPE_SIGNATURE } from '../consts.js'
import {
  compact, consumerRightsOf, errorText, fingerprints, paygateCustomers, payment, stripePricingConfig,
} from '../utils.js'
import { isSoldThrough, planLookupKey } from '../sync.js'
import { countryName, formatMoney } from '../consumer/format.js'
import { hasPaid, recordEvent, wasUnlocked } from '../consumer/records.js'
import {
  admitCheckout, assertAmountAllowed, narrowAmountFor, releaseAdmitted, sessionTtlOf,
} from './checkout-plugins.js'
import type { Admitted } from './checkout-plugins.js'
import { createEventHandler } from './events.js'
import { chargeAmount, settlementAmount } from './fx.js'
import { stripeWebhookSecrets } from './webhook-manager.js'
import type {
  CheckoutAttempt, CheckoutPlugin, CheckoutTextContext, CreateLinkParams, PaymentPlan, PaymentProduct,
} from '../types.js'

/** Stripe's limit on every `custom_text` message. */
const CUSTOM_TEXT_MAX = 1200

interface CheckoutOptionsFlags {
  /** The billing country is locked and the saved customer address carries it: never overwrite it. */
  locked?: boolean
  /** Adaptive Pricing is allowed on this session (the charge currency is the settlement currency). */
  adaptive?: boolean
}

/**
 * A Checkout Session's tax and currency options, entirely driven by the declared `PricingPolicy` —
 * an undeclared one (`DEFAULT_PRICING_POLICY`) reproduces exactly what every session hard-coded
 * before this policy existed: automatic tax and tax-id collection on, no Adaptive Pricing.
 *
 * `customer_update.address` lets automatic tax use the billing address Checkout just collected
 * rather than only a previously saved one; `customer_update.name` lets tax-id collection save the
 * business name it collects. Each is included only for the concern that needs it. Under a country
 * lock the saved address is kept (`address: 'never'`, collection `'auto'`), so tax follows the
 * locked country and Checkout cannot move it.
 */
const checkoutOptions = (
  policy: PricingPolicy, promotions: boolean, flags: CheckoutOptionsFlags = {},
): Partial<Stripe.Checkout.SessionCreateParams> => {
  const customerUpdate: Stripe.Checkout.SessionCreateParams.CustomerUpdate = {}
  if (policy.tax.automatic) customerUpdate.address = flags.locked === true ? 'never' : 'auto'
  if (policy.tax.collectTaxId) customerUpdate.name = 'auto'

  return {
    ...(policy.tax.automatic
      ? { automatic_tax: { enabled: true }, billing_address_collection: flags.locked === true ? 'auto' as const : 'required' as const }
      : {}),
    ...(policy.tax.collectTaxId ? { tax_id_collection: { enabled: true } } : {}),
    ...(Object.keys(customerUpdate).length > 0 ? { customer_update: customerUpdate } : {}),
    ...(policy.currency.adaptive === true && flags.adaptive !== false ? { adaptive_pricing: { enabled: true } } : {}),
    allow_promotion_codes: promotions,
  }
}

const ensureStripeCustomer = async (
  ctx: ApiContext, stripe: Stripe, params: CreateLinkParams,
): Promise<Stripe.Customer> => {
  const resource = paygateCustomers(ctx)
  const existing = await resource.byEntity(params.entityId, STRIPE_PAYGATE_ALIAS)
  if (existing != null && existing.deletedAt == null) {
    const retrieved = await stripe.customers.retrieve(existing.externalId)
    if (!(retrieved as Stripe.DeletedCustomer).deleted) {
      const customer = retrieved as Stripe.Customer
      if (params.locale != null && customer.preferred_locales?.[0] !== params.locale) {
        return await stripe.customers.update(customer.id, { preferred_locales: [params.locale] })
      }
      return customer
    }
  }
  const created = await stripe.customers.create({
    metadata: {
      entityId: params.entityId, ...(params.profileId && { profileId: params.profileId }),
      service: params.service,
    },
    ...(params.locale != null ? { preferred_locales: [params.locale] } : {}),
  })
  if (existing != null) {
    const { deletedAt: _deleted, ...kept } = existing
    await resource.update({ ...kept, externalId: created.id })
  } else {
    await resource.create({
      paygate: STRIPE_PAYGATE_ALIAS, externalId: created.id, entityId: params.entityId,
      ...(params.profileId != null ? { profileId: params.profileId } : {}),
    })
  }
  return created
}

const findPrice = async (stripe: Stripe, productSku: string, lookupKey: string): Promise<Stripe.Price> => {
  const prices = await stripe.prices.list({ product: productSku, active: true, lookup_keys: [lookupKey] })
  if (prices.data.length === 0) throw new ProductError(`price:${lookupKey}`)
  return prices.data[0]
}

const sharedSession = (
  customer: Stripe.Customer, params: CreateLinkParams, product: PaymentProduct,
  plan: PaymentPlan, metadata: Record<string, string>,
): Pick<Stripe.Checkout.SessionCreateParams, 'customer' | 'success_url' | 'cancel_url' | 'metadata' | 'locale'> => ({
  customer: customer.id,
  success_url: params.successUrl,
  cancel_url: params.cancelUrl ?? params.successUrl,
  ...(params.locale != null ? { locale: params.locale as Stripe.Checkout.SessionCreateParams.Locale } : {}),
  metadata: {
    pricingMode: plan.pricingMode ?? CheckoutPricingMode.Quantity,
    currency: (plan.currency ?? 'usd').toLowerCase(),
    entityId: params.entityId,
    ...(params.profileId && { profileId: params.profileId }),
    service: params.service,
    productSku: product.sku,
    planSku: plan.sku,
    ...metadata,
  },
})

export const amountCheckoutLineItem = (
  product: PaymentProduct, plan: PaymentPlan, amountMinor: number, behavior: TaxBehavior = TaxBehavior.Exclusive,
): { lineItem: Stripe.Checkout.SessionCreateParams.LineItem; chargeMinor: number; currency: string } => {
  if (plan.amountPolicy == null) throw new ProductError(`amount-policy:${plan.sku}`)
  assertCheckoutAmount(plan.amountPolicy, amountMinor)
  const chargeMinor = chargeAmountMinor(amountMinor, plan.amountPolicy)
  const currency = plan.amountPolicy.currency.toLowerCase()
  return {
    lineItem: {
      price_data: {
        product: product.sku, currency, unit_amount: chargeMinor, tax_behavior: behavior,
      },
      quantity: 1,
    },
    chargeMinor,
    currency,
  }
}

export const quantityCheckoutLineItem = (
  price: Stripe.Price, policy: { minimum: number; maximum: number; default: number },
): Stripe.Checkout.SessionCreateParams.LineItem => ({
  price: price.id,
  adjustable_quantity: { enabled: true, minimum: policy.minimum, maximum: policy.maximum },
  quantity: policy.default,
})

/** The plan an amount/quantity checkout of a consumable product sells: the named one, else the first. */
export const consumablePlanOf = async (
  ctx: ApiContext, productSku: string, planSku?: string,
): Promise<{ product: PaymentProduct, plan: PaymentPlan }> => {
  const product = await payment(ctx).product(productSku) as PaymentProduct
  const plans = (await payment(ctx).allPlans(product.sku) as PaymentPlan[])
    .filter(plan => isSoldThrough(product, plan, STRIPE_PAYGATE_ALIAS))
  if (planSku != null && !plans.some(plan => plan.sku === planSku)) {
    throw new ProductError(`plan:${planSku}`)
  }
  const plan = plans.find(item => item.sku === planSku) ?? plans[0]
  if (plan == null) throw new ProductError('plan')

  return { product, plan }
}

/** What the consumer-rights policy makes of this checkout's buyer. */
interface BuyerContext {
  policy: ConsumerRightsPolicy | null
  profile: BillingProfileView | null
  country?: string
  region: ConsumerRegion | null
  inScope: boolean
  language: string
  /** `null`: the policy names no region currencies — the legacy settlement behaviour. */
  chargeCurrency: string | null
  /** A locked profile whose country the saved customer address carries. */
  addressLocked: boolean
}

/**
 * The buyer as the consumer-rights policy sees it — a locked profile overrides the declared
 * country (a different one is `BillingCountryLocked`), an organization that already paid before
 * its country was locked is locked lazily from its paygate customer's address, and a locked
 * customer address that no longer carries the locked country refuses (the operator relocks).
 */
const buyerOf = async (
  ctx: ApiContext, stripe: Stripe, params: CreateLinkParams, catalogueCurrency: string,
): Promise<{ buyer: BuyerContext, customer: Stripe.Customer }> => {
  const policy = await payment(ctx).consumerRightsPolicy()
  const rights = policy != null ? consumerRightsOf(ctx) : null
  let profile = rights != null ? await rights.profile(params.entityId) : null
  const declared = params.country != null && params.country.trim() !== '' ? params.country.trim().toUpperCase() : undefined
  if (profile?.locked === true && declared != null && declared !== profile.country) {
    throw new BillingCountryLocked({ country: profile.country as string, requested: declared })
  }
  let customer = await ensureStripeCustomer(ctx, stripe, params)
  const customerCountry = customer.address?.country?.toUpperCase() ?? undefined
  if (rights != null && policy?.mechanisms.countryLock === true && profile == null && customerCountry != null
    && await hasPaid(ctx, params.entityId) && !await wasUnlocked(ctx, params.entityId)) {
    // An organization that paid before countries were locked: its saved address is its country.
    // One an operator unlocked is locked again by its next completed purchase instead.
    profile = await rights.lock(params.entityId, customerCountry, 'customer', { customerId: customer.id })
  }
  if (policy != null && profile == null && declared != null && customerCountry == null) {
    // Preselect the declared country on Checkout's address form; never over a saved address.
    customer = await stripe.customers.update(customer.id, { address: { country: declared } })
  }
  if (profile?.locked === true && declared != null && declared !== profile.country) {
    throw new BillingCountryLocked({ country: profile.country as string, requested: declared })
  }
  if (profile?.locked === true && customerCountry != null && customerCountry !== profile.country) {
    throw new BillingCountryLocked({ country: profile.country as string, requested: customerCountry })
  }
  const country = profile?.country ?? declared
  const region = policy != null ? regionOf(country, policy) : null
  const settlement = (await stripePricingConfig(ctx))?.settlementCurrency?.toLowerCase()
  const regional = policy?.currencies != null && Object.keys(policy.currencies).length > 0

  return {
    customer,
    buyer: {
      policy,
      profile,
      ...(country != null ? { country } : {}),
      region,
      inScope: policy != null ? inScope(region, country, policy) : false,
      language: params.consumerLanguage ?? profile?.language ?? billingLanguageOf(country, policy),
      chargeCurrency: regional
        ? (profile?.currency ?? chargeCurrencyOf(region, policy, settlement ?? catalogueCurrency)).toLowerCase()
        : null,
      addressLocked: profile?.locked === true && customerCountry != null,
    },
  }
}

/**
 * The consumer-rights metadata every session (and its subscription) carries. `termsCollected`
 * says whether Checkout asked for the terms checkbox — `'false'` also after the fallback of a
 * Dashboard without a terms URL.
 */
const consumerMetadata = (buyer: BuyerContext, params: CreateLinkParams, startRequestId?: string): Record<string, string> =>
  buyer.policy == null ? {} : compact({
    region: buyer.region ?? undefined,
    country: buyer.country,
    language: buyer.language,
    termsVersion: buyer.policy.textVersion,
    copyVersion: CONSUMER_RIGHTS_COPY_VERSION,
    termsCollected: String(buyer.policy.mechanisms.checkoutTerms === true),
    ipCountry: params.ipCountry?.toUpperCase(),
    startRequestId,
  }) as Record<string, string>

const limited = (message: string, field: string): string => {
  if (message.length > CUSTOM_TEXT_MAX) {
    throw new ConsumerRightsError(`copy:length:${field}`)
  }

  return message
}

/** The terms checkbox and its text, when the policy asks for them on every checkout. */
const termsOptions = (buyer: BuyerContext): Partial<Stripe.Checkout.SessionCreateParams> & { terms?: string } => {
  const policy = buyer.policy
  if (policy?.mechanisms.checkoutTerms !== true) {
    return {}
  }
  const links = linksOf(policy, buyer.language)
  const withInformation = buyer.inScope && links.withdrawalInformation != null
  const message = limited(consumerText(buyer.language, `checkout.terms-acceptance.${withInformation ? 'in-scope' : 'other'}`, {
    billingTerms: links.billingTerms, ...(withInformation ? { withdrawalInformation: links.withdrawalInformation as string } : {}),
  }), 'terms')

  return { consent_collection: { terms_of_service: 'required' }, terms: message }
}

const textContextOf = (buyer: BuyerContext, currency: string, extra: Partial<CheckoutTextContext> = {}): CheckoutTextContext => compact({
  language: buyer.language, currency, region: buyer.region, country: buyer.country, ...extra,
}) as CheckoutTextContext

const submitTextOf = (params: CreateLinkParams, context: CheckoutTextContext): string | undefined => {
  if (params.submitText == null) {
    return undefined
  }
  const message = typeof params.submitText === 'function' ? params.submitText(context) : params.submitText

  return message.trim() === '' ? undefined : message
}

/** Whether the synced reusable price of a plan can be charged in `currency` (its default or an option). */
const priceCarries = async (
  ctx: ApiContext, product: PaymentProduct, plan: PaymentPlan, price: Stripe.Price, currency: string,
): Promise<{ carries: boolean, unitAmount?: number }> => {
  if (price.currency === currency) {
    return { carries: true, ...(price.unit_amount != null ? { unitAmount: price.unit_amount } : {}) }
  }
  const listed = (price as unknown as { currency_options?: Record<string, { unit_amount?: number | null }> }).currency_options?.[currency]
  if (listed != null) {
    return { carries: true, ...(listed.unit_amount != null ? { unitAmount: listed.unit_amount } : {}) }
  }
  const synced = (await fingerprints(ctx).bySku(product.sku))?.prices?.find(entry => entry.planSku === plan.sku && entry.priceId === price.id)
  const option = synced?.options.find(entry => entry.currency === currency)

  return option != null ? { carries: true, unitAmount: option.unitAmount } : { carries: false }
}

interface StripeErrorShape {
  type?: string
  rawType?: string
  code?: string
  param?: string
  message?: string
  raw?: { type?: string, code?: string, param?: string, message?: string }
}

/**
 * Stripe refuses `consent_collection.terms_of_service` while the account has no terms-of-service URL
 * in its Dashboard (Settings → Public details): an `invalid_request_error` on the param
 * `consent_collection[terms_of_service]` saying "You cannot collect consent to your terms of service
 * unless a URL is set in the Stripe Dashboard …". Matched on the param with a terms message, or on
 * the message alone; any other error type never matches.
 */
export const isMissingTermsUrl = (error: unknown): boolean => {
  if (error == null || typeof error !== 'object') {
    return false
  }
  const typed = error as StripeErrorShape
  const kind = typed.rawType ?? typed.raw?.type ?? typed.type
  if (kind != null && kind !== 'invalid_request_error' && kind !== 'StripeInvalidRequestError') {
    return false
  }
  const param = (typed.param ?? typed.raw?.param ?? '').replace(/\s/g, '')
  const message = typed.message ?? typed.raw?.message ?? ''
  const aboutTerms = /terms of service/i.test(message)
  const onTermsParam = /^consent_collection(\[|\.)terms_of_service\]?$/.test(param)

  return (onTermsParam && aboutTerms) || (aboutTerms && /\burl\b/i.test(message) && /dashboard/i.test(message))
}

/** The same session without the terms checkbox and its text — and saying so in its metadata. */
const withoutTerms = (params: Stripe.Checkout.SessionCreateParams): Stripe.Checkout.SessionCreateParams => {
  const { consent_collection: consent, custom_text: customText, ...rest } = params
  const { terms_of_service: _terms, ...otherConsent } = consent ?? {}
  const { terms_of_service_acceptance: _acceptance, ...otherText } = customText ?? {}
  const marked = (metadata: Stripe.MetadataParam | undefined): Stripe.MetadataParam | undefined =>
    metadata != null ? { ...metadata, termsCollected: 'false' } : metadata

  return {
    ...rest,
    ...(Object.keys(otherConsent).length > 0 ? { consent_collection: otherConsent } : {}),
    ...(Object.keys(otherText).length > 0 ? { custom_text: otherText } : {}),
    metadata: marked(rest.metadata) ?? { termsCollected: 'false' },
    ...(rest.subscription_data != null
      ? { subscription_data: { ...rest.subscription_data, metadata: marked(rest.subscription_data.metadata) ?? { termsCollected: 'false' } } }
      : {}),
  }
}

/** One console warning per context — a process builds one. */
const warnedTermsFallback = new WeakSet<object>()

/**
 * A Dashboard without a terms-of-service URL must never stop a payment: the session is created
 * once more without the checkbox, an operator is told (once), and the degraded checkout is audited
 * as a `checkout-terms-fallback` event of the organization (`externalId` = the session).
 */
const createWithoutTerms = async (
  ctx: ApiContext, stripe: Stripe, attempt: CheckoutAttempt, params: Stripe.Checkout.SessionCreateParams, refusal: unknown,
): Promise<Stripe.Checkout.Session> => {
  const stripeMessage = errorText(refusal)
  if (!warnedTermsFallback.has(ctx)) {
    warnedTermsFallback.add(ctx)
    console.warn('[payment] Stripe refused the terms-of-service checkbox: this account has no terms of service URL. '
      + 'Checkouts continue WITHOUT the checkbox (metadata termsCollected=false). Operator: set the Billing Terms URL '
      + 'in the Stripe Dashboard → Settings → Public details (test and live mode alike).')
  }
  const typed = refusal as StripeErrorShape
  const detail = JSON.stringify(compact({
    message: stripeMessage, code: typed.code ?? typed.raw?.code, param: typed.param ?? typed.raw?.param,
    mode: attempt.mode, productSku: attempt.productSku, planSku: attempt.planSku,
  }))
  try {
    const session = await stripe.checkout.sessions.create(withoutTerms(params))
    await recordEvent(ctx, {
      recordId: attempt.entityId, recordKind: 'checkout', entityId: attempt.entityId, action: 'checkout-terms-fallback',
      ok: false, externalId: session.id, detail,
    })

    return session
  } catch (error) {
    await recordEvent(ctx, {
      recordId: attempt.entityId, recordKind: 'checkout', entityId: attempt.entityId, action: 'checkout-terms-fallback',
      ok: false, detail, error: errorText(error),
    })
    throw error
  }
}

/**
 * Create the session, then tell the plugins it exists. A plugin's `created` that throws expires
 * the fresh session and releases every admission before the error propagates. A session Stripe
 * refuses for the terms checkbox alone (no terms URL in the Dashboard) is created once more
 * without it — under the same admissions.
 */
const createSession = async (
  ctx: ApiContext, stripe: Stripe, plugins: readonly CheckoutPlugin[], attempt: CheckoutAttempt,
  params: Stripe.Checkout.SessionCreateParams,
): Promise<string> => {
  const admitted: Admitted[] = await admitCheckout(ctx, plugins, attempt)
  const holders = admitted.filter(entry => entry.plugin.admit != null)
  let session: Stripe.Checkout.Session
  try {
    try {
      session = await stripe.checkout.sessions.create(params)
    } catch (error) {
      if (params.consent_collection?.terms_of_service !== 'required' || !isMissingTermsUrl(error)) {
        throw error
      }
      session = await createWithoutTerms(ctx, stripe, attempt, params, error)
    }
  } catch (error) {
    await releaseAdmitted(ctx, holders, attempt)
    throw error
  }
  if (session.url == null) {
    await releaseAdmitted(ctx, holders, attempt, session.id)
    throw new PaygateError('session')
  }
  for (const { plugin, reservationId } of admitted) {
    if (plugin.created == null) {
      continue
    }
    try {
      await plugin.created(ctx, { ...attempt, sessionId: session.id, url: session.url, ...(reservationId != null ? { reservationId } : {}) })
    } catch (error) {
      try {
        await stripe.checkout.sessions.expire(session.id)
      } catch (expireError) {
        console.error(`[payment] could not expire checkout "${session.id}" after a plugin refused it`, expireError)
      }
      await releaseAdmitted(ctx, holders, attempt, session.id)
      throw error
    }
  }

  return session.url
}

/**
 * A Stripe Checkout URL: an amount or quantity purchase of a consumable product, or a subscription
 * to `planSku` (else the product's first recurring plan). A free plan is never checked out.
 *
 * With a consumer-rights policy: a locked billing country overrides the declared one (another is
 * `BillingCountryLocked`); the charge currency is the profile's, else the region's; an amount
 * checkout is narrowed by the checkout plugins (`CheckoutLimitExceeded`) and charged without FX
 * when its policy currency is the charge currency; a subscription needs a fresh start request
 * bound to its plan; the terms checkbox and the legal submit texts come from the copy.
 */
export const createCheckoutLink = async (
  ctx: ApiContext, stripe: Stripe, params: CreateLinkParams, plugins: readonly CheckoutPlugin[] = [],
): Promise<string> => {
  const product = await payment(ctx).product(params.productSku) as PaymentProduct
  const plans = (await payment(ctx).allPlans(product.sku) as PaymentPlan[])
    .filter(plan => isSoldThrough(product, plan, STRIPE_PAYGATE_ALIAS))
  if (params.planSku != null && !plans.some(plan => plan.sku === params.planSku)) {
    throw new ProductError(`plan:${params.planSku}`)
  }
  const consumable = product.type === ProductType.Consumable
  const plan = consumable
    ? plans.find(item => item.sku === params.planSku) ?? plans[0]
    : plans.find(item => item.sku === params.planSku) ?? plans.find(item => item.recurring != null) ?? plans[0]
  if (plan == null) throw new ProductError('plan')
  const catalogueCurrency = (plan.amountPolicy?.currency ?? plan.currency ?? 'usd').toLowerCase()
  const { buyer, customer } = await buyerOf(ctx, stripe, params, catalogueCurrency)
  const pricing = await payment(ctx).pricingPolicy()
  const settlement = (await stripePricingConfig(ctx))?.settlementCurrency?.toLowerCase()
  const ttl = sessionTtlOf(plugins)
  const now = new Date()
  const expiresAt = ttl != null ? new Date((Math.floor(now.getTime() / 1000) + ttl) * 1000) : undefined
  const expiry = expiresAt != null ? { expires_at: Math.floor(expiresAt.getTime() / 1000) } : {}
  const { terms, ...termsParams } = termsOptions(buyer)
  const base = {
    entityId: params.entityId, productSku: product.sku, planSku: plan.sku, at: now,
    ...(ttl != null ? { sessionTtlSeconds: ttl } : {}), ...(expiresAt != null ? { expiresAt } : {}),
  }

  if (consumable && plan.pricingMode === CheckoutPricingMode.Amount) {
    if (params.amountMinor == null) throw new ProductError('amount')
    const { chargeMinor: sourceChargeMinor, currency: amountCurrency } = amountCheckoutLineItem(
      product, plan, params.amountMinor, pricing.tax.behavior,
    )
    const view = await narrowAmountFor(ctx, plugins, {
      entityId: params.entityId, productSku: product.sku, planSku: plan.sku,
      base: plan.amountPolicy as NonNullable<PaymentPlan['amountPolicy']>, at: now,
    })
    assertAmountAllowed(view, params.amountMinor)
    const charged = buyer.chargeCurrency != null
      ? await chargeAmount(ctx, stripe, sourceChargeMinor, amountCurrency, buyer.chargeCurrency)
      : await settlementAmount(ctx, stripe, sourceChargeMinor, amountCurrency)
    const adaptive = buyer.chargeCurrency == null || charged.currency === (settlement ?? amountCurrency)
    const context = textContextOf(buyer, charged.currency, { unitAmountMinor: charged.amountMinor })
    const submit = submitTextOf(params, context)
      ?? (buyer.policy != null && buyer.inScope && buyer.country != null
        ? consumerText(buyer.language, 'checkout.top-up', {
          product: product.title, country: countryName(buyer.country, buyer.language),
        })
        : undefined)
    const customText = compact({
      ...(submit != null ? { submit: { message: limited(submit, 'submit') } } : {}),
      ...(terms != null ? { terms_of_service_acceptance: { message: terms } } : {}),
    })
    const lineItem: Stripe.Checkout.SessionCreateParams.LineItem = {
      price_data: {
        product: product.sku, currency: charged.currency, unit_amount: charged.amountMinor,
        tax_behavior: pricing.tax.behavior,
      },
      quantity: 1,
    }

    return await createSession(ctx, stripe, plugins, {
      ...base, mode: 'amount', amountMinor: params.amountMinor, amountCurrency, chargeMinor: charged.amountMinor,
      currency: charged.currency,
    }, {
      mode: 'payment', line_items: [lineItem], invoice_creation: { enabled: true },
      ...checkoutOptions(pricing, false, { locked: buyer.addressLocked, adaptive }),
      ...termsParams,
      ...(Object.keys(customText).length > 0 ? { custom_text: customText } : {}),
      ...expiry,
      ...sharedSession(customer, params, product, plan, {
        pricingMode: CheckoutPricingMode.Amount,
        currency: charged.currency,
        amountCurrency,
        amountMinor: String(params.amountMinor),
        sourceChargeAmountMinor: String(sourceChargeMinor),
        chargeAmountMinor: String(charged.amountMinor),
        ...consumerMetadata(buyer, params),
      }),
    })
  }

  const price = await findPrice(stripe, product.sku, planLookupKey(product, plan))
  const forced = buyer.chargeCurrency != null
    ? await priceCarries(ctx, product, plan, price, buyer.chargeCurrency) : { carries: false }
  if (buyer.chargeCurrency != null && !forced.carries) {
    console.warn(`[payment] plan "${plan.sku}" has no ${buyer.chargeCurrency.toUpperCase()} price; Stripe picks the currency`)
  }
  const currency = forced.carries ? buyer.chargeCurrency as string : price.currency
  const adaptive = buyer.chargeCurrency == null || currency === (settlement ?? price.currency)
  // Forced only when the synced price carries it: a session currency the price lacks is refused.
  const currencyParam = forced.carries ? { currency } : {}

  if (consumable) {
    const quantityPolicy = plan.quantityPolicy ?? {
      minimum: plan.minQuantity ?? 1,
      maximum: plan.maxQuantity ?? Math.max(100_000, plan.minQuantity ?? 1),
      default: plan.defaultQuantity ?? plan.minQuantity ?? 1,
    }
    const submit = submitTextOf(params, textContextOf(buyer, currency, compact({ unitAmountMinor: forced.unitAmount ?? price.unit_amount ?? undefined })))
    const customText = compact({
      ...(submit != null ? { submit: { message: limited(submit, 'submit') } } : {}),
      ...(terms != null ? { terms_of_service_acceptance: { message: terms } } : {}),
    })

    return await createSession(ctx, stripe, plugins, { ...base, mode: 'quantity', currency }, {
      mode: 'payment',
      line_items: [quantityCheckoutLineItem(price, quantityPolicy)],
      invoice_creation: { enabled: true },
      ...currencyParam,
      ...checkoutOptions(pricing, true, { locked: buyer.addressLocked, adaptive }),
      ...termsParams,
      ...(Object.keys(customText).length > 0 ? { custom_text: customText } : {}),
      ...expiry,
      ...sharedSession(customer, params, product, plan, {
        pricingMode: CheckoutPricingMode.Quantity,
        ...(forced.carries ? { currency } : {}),
        ...consumerMetadata(buyer, params),
      }),
    })
  }

  // A subscription starts services at once: in scope (or unknown and protected) it needs the
  // consumer's express start request, fresh and bound to this organization and plan.
  const start = buyer.policy != null ? await consumerRightsOf(ctx)?.assertStartRequest(params.entityId, plan.sku, params.startRequestId) ?? null : null
  const subscriptionPaymentMethodTypes = (
    await stripePricingConfig(ctx)
  )?.subscriptionPaymentMethodTypes as Stripe.Checkout.SessionCreateParams.PaymentMethodType[] | undefined
  const unitAmount = forced.unitAmount ?? price.unit_amount ?? undefined
  const interval = plan.recurring?.interval
  const context = textContextOf(buyer, currency, compact({ unitAmountMinor: unitAmount, interval }))
  const renewal = buyer.policy != null && unitAmount != null && interval != null
    ? consumerText(buyer.language, `checkout.renewal.${interval}`, {
      price: consumerText(buyer.language, `checkout.price.${pricing.tax.behavior === TaxBehavior.Inclusive ? 'inclusive' : 'exclusive'}`, {
        amount: formatMoney(unitAmount, currency, buyer.language),
      }),
    })
    : undefined
  const submit = submitTextOf(params, context) ?? renewal
  const links = buyer.policy != null ? linksOf(buyer.policy, buyer.language) : null
  const afterSubmit = buyer.policy?.mechanisms.cancellation === true && links?.cancellation != null
    ? consumerText(buyer.language, 'checkout.renewal.after-submit', { cancelUrl: links.cancellation })
    : undefined
  const customText = compact({
    ...(submit != null ? { submit: { message: limited(submit, 'submit') } } : {}),
    ...(afterSubmit != null ? { after_submit: { message: limited(afterSubmit, 'after-submit') } } : {}),
    ...(terms != null ? { terms_of_service_acceptance: { message: terms } } : {}),
  })
  const startRequestId = start?.id ?? undefined
  const metadata = consumerMetadata(buyer, params, startRequestId)

  return await createSession(ctx, stripe, plugins, { ...base, mode: 'subscription', currency }, {
    mode: 'subscription', line_items: [{ price: price.id, quantity: 1 }],
    ...currencyParam,
    ...(subscriptionPaymentMethodTypes != null ? { payment_method_types: subscriptionPaymentMethodTypes } : {}),
    ...(Object.keys(customText).length > 0 ? { custom_text: customText } : {}),
    subscription_data: {
      metadata: {
        pricingMode: CheckoutPricingMode.Quantity, entityId: params.entityId,
        service: params.service, productSku: product.sku, planSku: plan.sku,
        ...(params.profileId != null ? { profileId: params.profileId } : {}),
        ...metadata,
      },
    },
    ...checkoutOptions(pricing, true, { locked: buyer.addressLocked, adaptive }),
    ...termsParams,
    ...expiry,
    ...sharedSession(customer, params, product, plan, metadata),
  })
}

interface WebhookRequest {
  original?: { rawBody?: string | Buffer }
  rawBody?: string | Buffer
  headers: Record<string, string | string[] | undefined>
}

/**
 * Verify a Stripe webhook against the configured override secret, then the managed endpoint's
 * stored one, and dispatch it.
 *
 * @throws PaygateError('signature') | WebhookSetupError('secret')
 */
export const handleStripeWebhook = async (ctx: ApiContext, stripe: Stripe, request: unknown): Promise<void> => {
  const typed = request as WebhookRequest
  const rawBody = typed.original?.rawBody ?? typed.rawBody
  const signature = typed.headers[STRIPE_SIGNATURE.toLowerCase()]
  if (rawBody == null || typeof signature !== 'string') throw new PaygateError('signature')

  const secrets = await stripeWebhookSecrets(ctx)
  if (secrets.length === 0) {
    throw new WebhookSetupError('secret')
  }
  let event: Stripe.Event | null = null
  for (const secret of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, signature, secret)
      break
    } catch {
      // Try the next secret; a signature none of them verifies is refused below.
    }
  }
  if (event == null) {
    throw new PaygateError('signature')
  }

  await createEventHandler(ctx, stripe).process(event)
}
