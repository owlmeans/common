import type Stripe from 'stripe'
import { BillingCountryLocked, CheckoutPricingMode, CONSUMER_RIGHTS_COPY_VERSION, ConsumerRightsError, PaygateError, ProductError, ProductType, TaxBehavior, type PricingPolicy, consumerCopyHelper, consumerRegionHelper, consumerRightsPolicyHelper } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import { STRIPE_PAYGATE_ALIAS } from '../consts.js'
import type { Admitted } from './types.js'
import type {
  CheckoutAttempt, CheckoutPlugin, CheckoutTextContext, CreateLinkParams, PaymentPlan, PaymentProduct,
} from '../types.js'
import { log } from '../log.js'
import { CUSTOM_TEXT_MAX, EMAIL } from './consts.local.js'
import type { BuyerContext, CheckoutOptionsFlags, StripeErrorShape } from './types.local.js'
import { fxOf } from './fx.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { planHelper } from '../plan.js'
import { checkoutPluginsOf } from './checkout-plugins.js'
import { checkoutPolicyHelper } from './checkout-policy.js'
import type { StripeCheckoutHelper } from './stripe/types.js'
import { stripeSessionHelper } from './session.js'
import { consumerFormatHelper } from '../consumer/format.js'
import { consumerRecordsOf } from '../consumer/records.js'

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
    adaptive_pricing: { enabled: policy.currency.adaptive === true && flags.adaptive !== false },
    allow_promotion_codes: promotions,
  }
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

/** A saved address holding only `country` — stale lines and a postal code of another country cleared. */
const countryOnlyAddress = (country: string): Stripe.AddressParam => ({
  country, line1: '', line2: '', city: '', state: '', postal_code: '',
})

/**
 * The consumer-rights metadata every session (and its subscription) carries. `termsCollected`
 * says whether Checkout asked for the terms checkbox — `'false'` also after the fallback of a
 * Dashboard without a terms URL; `countryPinned` that tax was calculated on `country`, held on the
 * customer by `stripe.lockCustomerCountry`, so that country is the one the purchase locks.
 */
const consumerMetadata = (buyer: BuyerContext, params: CreateLinkParams, startRequestId?: string): Record<string, string> =>
  buyer.policy == null ? {} : paymentUtils.compact({
    region: buyer.region ?? undefined,
    country: buyer.country,
    language: buyer.language,
    termsVersion: buyer.policy.textVersion,
    copyVersion: CONSUMER_RIGHTS_COPY_VERSION,
    termsCollected: String(buyer.policy.mechanisms.checkoutTerms === true),
    ipCountry: params.ipCountry?.toUpperCase(),
    startRequestId,
    countryPinned: buyer.countryPinned ? 'true' : undefined,
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
  const links = consumerRightsPolicyHelper.linksOf(policy, buyer.language)
  const withInformation = buyer.inScope && links.withdrawalInformation != null
  const message = limited(consumerCopyHelper.consumerText(buyer.language, `checkout.terms-acceptance.${withInformation ? 'in-scope' : 'other'}`, {
    billingTerms: links.billingTerms, ...(withInformation ? { withdrawalInformation: links.withdrawalInformation as string } : {}),
  }), 'terms')

  return { consent_collection: { terms_of_service: 'required' }, terms: message }
}

const textContextOf = (buyer: BuyerContext, currency: string, extra: Partial<CheckoutTextContext> = {}): CheckoutTextContext => paymentUtils.compact({
  language: buyer.language, currency, region: buyer.region, country: buyer.country, ...extra,
}) as CheckoutTextContext

const submitTextOf = (params: CreateLinkParams, context: CheckoutTextContext): string | undefined => {
  if (params.submitText == null) {
    return undefined
  }
  const message = typeof params.submitText === 'function' ? params.submitText(context) : params.submitText

  return message.trim() === '' ? undefined : message
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

export const makeStripeCheckoutHelper = (ctx: ApiContext): StripeCheckoutHelper => {
  const access = paymentAccessOf(ctx)

  /**
   * The e-mail a checkout pins on its Stripe customer: `params.email` under
   * `stripe.lockCustomerEmail`, `undefined` without the lock.
   *
   * @throws PaygateError('customer-email') — the lock is declared and no usable e-mail was passed
   */
  const lockedEmailOf = async (params: CreateLinkParams): Promise<string | undefined> => {
    if ((await access.stripePricingConfig())?.lockCustomerEmail !== true) {
      return undefined
    }
    const email = params.email?.trim()
    if (email == null || !EMAIL.test(email)) {
      throw new PaygateError('customer-email')
    }

    return email
  }

  /**
   * The entity's Stripe customer, created on first use. Under `stripe.lockCustomerEmail` it carries
   * the buyer's e-mail — written over any other one — because Checkout shows a customer's valid
   * e-mail read-only (and only asks for one, then saves it, while the customer has none).
   */
  const ensureStripeCustomer = async (stripe: Stripe, params: CreateLinkParams): Promise<Stripe.Customer> => {
    const email = await lockedEmailOf(params)
    const resource = access.paygateCustomers()
    const existing = await resource.byEntity(params.entityId, STRIPE_PAYGATE_ALIAS)
    if (existing != null && existing.deletedAt == null) {
      const retrieved = await stripe.customers.retrieve(existing.externalId)
      if (!(retrieved as Stripe.DeletedCustomer).deleted) {
        const customer = retrieved as Stripe.Customer
        const update: Stripe.CustomerUpdateParams = {
          ...(params.locale != null && customer.preferred_locales?.[0] !== params.locale ? { preferred_locales: [params.locale] } : {}),
          ...(email != null && customer.email?.toLowerCase() !== email.toLowerCase() ? { email } : {}),
        }
        return Object.keys(update).length > 0 ? await stripe.customers.update(customer.id, update) : customer
      }
    }
    const created = await stripe.customers.create({
      metadata: {
        entityId: params.entityId, ...(params.profileId && { profileId: params.profileId }),
        service: params.service,
      },
      ...(params.locale != null ? { preferred_locales: [params.locale] } : {}),
      ...(email != null ? { email } : {}),
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

  /**
   * The buyer as the consumer-rights policy sees it — a locked profile overrides the declared
   * country (a different one is `BillingCountryLocked`), an organization that already paid before
   * its country was locked is locked lazily from its paygate customer's address, and a locked
   * customer address that no longer carries the locked country refuses (the operator relocks).
   *
   * Under `stripe.lockCustomerCountry` the known country (the locked one, else the declared one) is
   * written to the customer — over a saved address of another country only before any lock — and
   * Checkout keeps it wherever Stripe Tax can calculate on it.
   */
  const buyerOf = async (
    stripe: Stripe, params: CreateLinkParams, catalogueCurrency: string,
  ): Promise<{ buyer: BuyerContext, customer: Stripe.Customer }> => {
    const policy = await access.payment().consumerRightsPolicy()
    const rights = policy != null ? access.consumerRightsOf() : null
    let profile = rights != null ? await rights.profile(params.entityId) : null
    const declared = params.country != null && params.country.trim() !== '' ? params.country.trim().toUpperCase() : undefined
    if (profile?.locked === true && declared != null && declared !== profile.country) {
      throw new BillingCountryLocked({ country: profile.country as string, requested: declared })
    }
    let customer = await ensureStripeCustomer(stripe, params)
    const customerCountry = customer.address?.country?.toUpperCase() ?? undefined
    if (rights != null && policy?.mechanisms.countryLock === true && profile == null && customerCountry != null
      && await consumerRecordsOf(ctx).hasPaid(params.entityId)
      && !await consumerRecordsOf(ctx).wasUnlocked(params.entityId)) {
      // An organization that paid before countries were locked: its saved address is its country.
      // One an operator unlocked is locked again by its next completed purchase instead.
      profile = await rights.lock(params.entityId, customerCountry, 'customer', { customerId: customer.id })
    }
    if (profile?.locked === true && declared != null && declared !== profile.country) {
      throw new BillingCountryLocked({ country: profile.country as string, requested: declared })
    }
    if (profile?.locked === true && customerCountry != null && customerCountry !== profile.country) {
      throw new BillingCountryLocked({ country: profile.country as string, requested: customerCountry })
    }
    const pinning = (await access.stripePricingConfig())?.lockCustomerCountry === true
    const country = profile?.country ?? declared
    if (pinning && country != null && customerCountry !== country) {
      // Pinned: the known country replaces whatever an unlocked customer saved (a locked customer's
      // other country was refused above), so Checkout has nothing else to offer.
      customer = await stripe.customers.update(customer.id, { address: countryOnlyAddress(country) })
    } else if (policy != null && profile == null && declared != null && customerCountry == null) {
      // Preselect the declared country on Checkout's address form; never over a saved address.
      customer = await stripe.customers.update(customer.id, { address: { country: declared } })
    }
    const savedCountry = customer.address?.country?.toUpperCase() ?? undefined
    const kept = savedCountry != null && savedCountry === country && stripeSessionHelper.isTaxLocatable(customer.address)
    const countryPinned = pinning && kept
    const region = policy != null ? consumerRegionHelper.regionOf(country, policy) : null
    const settlement = (await access.stripePricingConfig())?.settlementCurrency?.toLowerCase()
    const regional = policy?.currencies != null && Object.keys(policy.currencies).length > 0

    return {
      customer,
      buyer: {
        policy,
        profile,
        ...(country != null ? { country } : {}),
        region,
        inScope: policy != null ? consumerRegionHelper.inScope(region, country, policy) : false,
        language: params.consumerLanguage ?? profile?.language ?? consumerRegionHelper.billingLanguageOf(country, policy),
        chargeCurrency: regional
          ? (profile?.currency ?? consumerRegionHelper.chargeCurrencyOf(region, policy, settlement ?? catalogueCurrency)).toLowerCase()
          : null,
        addressLocked: kept && (profile?.locked === true || countryPinned),
        countryPinned,
      },
    }
  }

  /** Whether the synced reusable price of a plan can be charged in `currency` (its default or an option). */
  const priceCarries = async (
    product: PaymentProduct, plan: PaymentPlan, price: Stripe.Price, currency: string,
  ): Promise<{ carries: boolean, unitAmount?: number }> => {
    if (price.currency === currency) {
      return { carries: true, ...(price.unit_amount != null ? { unitAmount: price.unit_amount } : {}) }
    }
    const listed = (price as unknown as { currency_options?: Record<string, { unit_amount?: number | null }> }).currency_options?.[currency]
    if (listed != null) {
      return { carries: true, ...(listed.unit_amount != null ? { unitAmount: listed.unit_amount } : {}) }
    }
    const synced = (await access.fingerprints().bySku(product.sku))?.prices?.find(entry => entry.planSku === plan.sku && entry.priceId === price.id)
    const option = synced?.options.find(entry => entry.currency === currency)

    return option != null ? { carries: true, unitAmount: option.unitAmount } : { carries: false }
  }

  /**
   * A Dashboard without a terms-of-service URL must never stop a payment: the session is created
   * once more without the checkbox, an operator is told (once), and the degraded checkout is audited
   * as a `checkout-terms-fallback` event of the organization (`externalId` = the session).
   */
  const createWithoutTerms = async (
    stripe: Stripe, attempt: CheckoutAttempt, params: Stripe.Checkout.SessionCreateParams, refusal: unknown,
  ): Promise<Stripe.Checkout.Session> => {
    const stripeMessage = paymentUtils.errorText(refusal)
    if (!warnedTermsFallback.has(ctx)) {
      warnedTermsFallback.add(ctx)
      log.warn('Stripe refused the terms-of-service checkbox: this account has no terms of service URL. '
        + 'Checkouts continue WITHOUT the checkbox (metadata termsCollected=false). Operator: set the Billing Terms URL '
        + 'in the Stripe Dashboard → Settings → Public details (test and live mode alike).')
    }
    const typed = refusal as StripeErrorShape
    const detail = JSON.stringify(paymentUtils.compact({
      message: stripeMessage, code: typed.code ?? typed.raw?.code, param: typed.param ?? typed.raw?.param,
      mode: attempt.mode, productSku: attempt.productSku, planSku: attempt.planSku,
    }))
    try {
      const session = await stripe.checkout.sessions.create(withoutTerms(params))
      await consumerRecordsOf(ctx).recordEvent({
        recordId: attempt.entityId, recordKind: 'checkout', entityId: attempt.entityId, action: 'checkout-terms-fallback',
        ok: false, externalId: session.id, detail,
      })

      return session
    } catch (error) {
      await consumerRecordsOf(ctx).recordEvent({
        recordId: attempt.entityId, recordKind: 'checkout', entityId: attempt.entityId, action: 'checkout-terms-fallback',
        ok: false, detail, error: paymentUtils.errorText(error),
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
    stripe: Stripe, plugins: readonly CheckoutPlugin[], attempt: CheckoutAttempt,
    params: Stripe.Checkout.SessionCreateParams,
  ): Promise<string> => {
    const admitted: Admitted[] = await checkoutPluginsOf(ctx).admitCheckout(plugins, attempt)
    const holders = admitted.filter(entry => entry.plugin.admit != null)
    let session: Stripe.Checkout.Session
    try {
      try {
        session = await stripe.checkout.sessions.create(params)
      } catch (error) {
        if (params.consent_collection?.terms_of_service !== 'required' || !stripeSessionHelper.isMissingTermsUrl(error)) {
          throw error
        }
        session = await createWithoutTerms(stripe, attempt, params, error)
      }
    } catch (error) {
      await checkoutPluginsOf(ctx).releaseAdmitted(holders, attempt)
      throw error
    }
    if (session.url == null) {
      await checkoutPluginsOf(ctx).releaseAdmitted(holders, attempt, session.id)
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
          log.error('Could not expire a checkout a plugin refused', { sessionId: session.id, error: expireError })
        }
        await checkoutPluginsOf(ctx).releaseAdmitted(holders, attempt, session.id)
        throw error
      }
    }

    return session.url
  }

  const createCheckoutLink = async (
    stripe: Stripe, params: CreateLinkParams, plugins: readonly CheckoutPlugin[] = [],
  ): Promise<string> => {
    const product = await access.payment().product(params.productSku) as PaymentProduct
    const plans = (await access.payment().allPlans(product.sku) as PaymentPlan[])
      .filter(plan => planHelper.isSoldThrough(product, plan, STRIPE_PAYGATE_ALIAS))
    if (params.planSku != null && !plans.some(plan => plan.sku === params.planSku)) {
      throw new ProductError(`plan:${params.planSku}`)
    }
    const consumable = product.type === ProductType.Consumable
    const plan = consumable
      ? plans.find(item => item.sku === params.planSku) ?? plans[0]
      : plans.find(item => item.sku === params.planSku) ?? plans.find(item => item.recurring != null) ?? plans[0]
    if (plan == null) throw new ProductError('plan')
    const catalogueCurrency = (plan.amountPolicy?.currency ?? plan.currency ?? 'usd').toLowerCase()
    const { buyer, customer } = await buyerOf(stripe, params, catalogueCurrency)
    const pricing = await access.payment().pricingPolicy()
    const settlement = (await access.stripePricingConfig())?.settlementCurrency?.toLowerCase()
    const ttl = checkoutPolicyHelper.sessionTtlOf(plugins)
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
      const { chargeMinor: sourceChargeMinor, currency: amountCurrency } = stripeSessionHelper.amountCheckoutLineItem(
        product, plan, params.amountMinor, pricing.tax.behavior,
      )
      const view = await checkoutPluginsOf(ctx).narrowAmountFor(plugins, {
        entityId: params.entityId, productSku: product.sku, planSku: plan.sku,
        base: plan.amountPolicy as NonNullable<PaymentPlan['amountPolicy']>, at: now,
      })
      checkoutPolicyHelper.assertAmountAllowed(view, params.amountMinor)
      const charged = buyer.chargeCurrency != null
        ? await fxOf(ctx).chargeAmount(stripe, sourceChargeMinor, amountCurrency, buyer.chargeCurrency)
        : await fxOf(ctx).settlementAmount(stripe, sourceChargeMinor, amountCurrency)
      const adaptive = buyer.chargeCurrency == null || charged.currency === (settlement ?? amountCurrency)
      const context = textContextOf(buyer, charged.currency, { unitAmountMinor: charged.amountMinor })
      const submit = submitTextOf(params, context)
        ?? (buyer.policy != null && buyer.inScope && buyer.country != null
          ? consumerCopyHelper.consumerText(buyer.language, 'checkout.top-up', {
            product: product.title, country: consumerFormatHelper.countryName(buyer.country, buyer.language),
          })
          : undefined)
      const customText = paymentUtils.compact({
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

      return await createSession(stripe, plugins, {
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

    const price = await findPrice(stripe, product.sku, planHelper.planLookupKey(product, plan))
    const forced = buyer.chargeCurrency != null
      ? await priceCarries(product, plan, price, buyer.chargeCurrency) : { carries: false }
    if (buyer.chargeCurrency != null && !forced.carries) {
      log.warn('Plan has no price in the charge currency; Stripe picks the currency', { plan: plan.sku, currency: buyer.chargeCurrency })
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
      const submit = submitTextOf(params, textContextOf(buyer, currency, paymentUtils.compact({ unitAmountMinor: forced.unitAmount ?? price.unit_amount ?? undefined })))
      const customText = paymentUtils.compact({
        ...(submit != null ? { submit: { message: limited(submit, 'submit') } } : {}),
        ...(terms != null ? { terms_of_service_acceptance: { message: terms } } : {}),
      })

      return await createSession(stripe, plugins, { ...base, mode: 'quantity', currency }, {
        mode: 'payment',
        line_items: [stripeSessionHelper.quantityCheckoutLineItem(price, quantityPolicy)],
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
    const start = buyer.policy != null ? await access.consumerRightsOf()?.assertStartRequest(params.entityId, plan.sku, params.startRequestId) ?? null : null
    const stripePricing = await access.stripePricingConfig()
    const subscriptionPaymentMethodTypes = (stripePricing?.subscriptionPaymentMethodTypesByCurrency?.[currency]
      ?? stripePricing?.subscriptionPaymentMethodTypes) as string[] | undefined
    const unitAmount = forced.unitAmount ?? price.unit_amount ?? undefined
    const interval = plan.recurring?.interval
    const context = textContextOf(buyer, currency, paymentUtils.compact({ unitAmountMinor: unitAmount, interval }))
    const renewal = buyer.policy != null && unitAmount != null && interval != null
      ? consumerCopyHelper.consumerText(buyer.language, `checkout.renewal.${interval}`, {
        price: consumerCopyHelper.consumerText(buyer.language, `checkout.price.${pricing.tax.behavior === TaxBehavior.Inclusive ? 'inclusive' : 'exclusive'}`, {
          amount: consumerFormatHelper.formatMoney(unitAmount, currency, buyer.language),
        }),
      })
      : undefined
    const submit = submitTextOf(params, context) ?? renewal
    const links = buyer.policy != null ? consumerRightsPolicyHelper.linksOf(buyer.policy, buyer.language) : null
    const afterSubmit = buyer.policy?.mechanisms.cancellation === true && links?.cancellation != null
      ? consumerCopyHelper.consumerText(buyer.language, 'checkout.renewal.after-submit', { cancelUrl: links.cancellation })
      : undefined
    const customText = paymentUtils.compact({
      ...(submit != null ? { submit: { message: limited(submit, 'submit') } } : {}),
      ...(afterSubmit != null ? { after_submit: { message: limited(afterSubmit, 'after-submit') } } : {}),
      ...(terms != null ? { terms_of_service_acceptance: { message: terms } } : {}),
    })
    const startRequestId = start?.id ?? undefined
    const metadata = consumerMetadata(buyer, params, startRequestId)

    return await createSession(stripe, plugins, { ...base, mode: 'subscription', currency }, {
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

  return { createCheckoutLink }
}

/** The Stripe Checkout of a context — one per context. */
export const stripeCheckoutOf = memoHelper.oncePer(makeStripeCheckoutHelper)
