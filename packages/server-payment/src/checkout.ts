import {
  BillingCountryLocked, CheckoutPricingMode, CONSUMER_RIGHTS_COPY_VERSION, ConsumerRightsError, PaygateError,
  ProductError, ProductType, TaxBehavior, checkoutPricingHelper, consumerCopyHelper, consumerRegionHelper,
  consumerRightsPolicyHelper,
} from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { Admitted } from './plugins/types.js'
import type {
  CheckoutAttempt, CheckoutPlugin, CheckoutTextContext, CreateLinkParams, PaymentPlan, PaymentProduct,
} from './types.js'
import type { Paygate, PaygateCustomer, PaygatePrice, PaygateSession, SessionInput } from './paygate/types.js'
import { log } from './log.js'
import { EMAIL } from './plugins/consts.local.js'
import type { BuyerContext } from './plugins/types.local.js'
import { fxOf } from './plugins/fx.js'
import { paymentAccessOf } from './access.js'
import { paymentUtils } from './utils.js'
import { planHelper } from './plan.js'
import { paygatesOf } from './paygate/registry.js'
import { checkoutPluginsOf } from './plugins/checkout-plugins.js'
import { checkoutPolicyHelper } from './plugins/checkout-policy.js'
import type { CheckoutHelper } from './checkout/types.js'
import { consumerFormatHelper } from './consumer/format.js'
import { consumerRecordsOf } from './consumer/records.js'

/** The metadata every session carries: what the checkout events read back. */
const sharedMetadata = (
  params: CreateLinkParams, product: PaymentProduct, plan: PaymentPlan, metadata: Record<string, string>,
): Record<string, string> => ({
  pricingMode: plan.pricingMode ?? CheckoutPricingMode.Quantity,
  currency: (plan.currency ?? 'usd').toLowerCase(),
  entityId: params.entityId,
  ...(params.profileId && { profileId: params.profileId }),
  service: params.service,
  productSku: product.sku,
  planSku: plan.sku,
  ...metadata,
})

/**
 * The consumer-rights metadata every session (and its subscription) carries. `termsCollected`
 * says whether the session asks for the terms checkbox — a paygate that drops it says `'false'`;
 * `countryPinned` that tax was calculated on `country`, held on the customer by the paygate's
 * customer country lock, so that country is the one the purchase locks.
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

export const makeCheckoutHelper = (ctx: ApiContext): CheckoutHelper => {
  const access = paymentAccessOf(ctx)

  /** A text within the paygate's `customTextMax`. @throws ConsumerRightsError('copy:length:<field>') */
  const limited = (paygate: Paygate, message: string, field: string): string => {
    const max = paygate.features.customTextMax
    if (max != null && message.length > max) {
      throw new ConsumerRightsError(`copy:length:${field}`)
    }

    return message
  }

  /** The terms checkbox and its text, when the policy asks for them on every checkout. */
  const termsOf = (paygate: Paygate, buyer: BuyerContext): { collect: boolean, text?: string } => {
    const policy = buyer.policy
    if (policy?.mechanisms.checkoutTerms !== true) {
      return { collect: false }
    }
    const links = consumerRightsPolicyHelper.linksOf(policy, buyer.language)
    const withInformation = buyer.inScope && links.withdrawalInformation != null
    const message = limited(paygate, consumerCopyHelper.consumerText(buyer.language, `checkout.terms-acceptance.${withInformation ? 'in-scope' : 'other'}`, {
      billingTerms: links.billingTerms, ...(withInformation ? { withdrawalInformation: links.withdrawalInformation as string } : {}),
    }), 'terms')

    return { collect: true, text: message }
  }

  /**
   * The e-mail a checkout pins on its paygate customer: `params.email` under the paygate's customer
   * e-mail lock, `undefined` without the lock.
   *
   * @throws PaygateError('customer-email') — the lock is declared and no usable e-mail was passed
   */
  const lockedEmailOf = async (paygate: Paygate, params: CreateLinkParams): Promise<string | undefined> => {
    if ((await paygate.customers.locks()).email !== true) {
      return undefined
    }
    const email = params.email?.trim()
    if (email == null || !EMAIL.test(email)) {
      throw new PaygateError('customer-email')
    }

    return email
  }

  /**
   * The buyer as the consumer-rights policy sees it — a locked profile overrides the declared
   * country (a different one is `BillingCountryLocked`), an organization that already paid before
   * its country was locked is locked lazily from its paygate customer's address, and a locked
   * customer address that no longer carries the locked country refuses (the operator relocks).
   *
   * Under the paygate's customer country lock the known country (the locked one, else the declared
   * one) is written to the customer — over a saved address of another country only before any lock —
   * and the session keeps it wherever the paygate can calculate tax on it.
   */
  const buyerOf = async (
    paygate: Paygate, params: CreateLinkParams, catalogueCurrency: string,
  ): Promise<{ buyer: BuyerContext, customer: PaygateCustomer }> => {
    const policy = await access.payment().consumerRightsPolicy()
    const rights = policy != null ? access.consumerRightsOf() : null
    let profile = rights != null ? await rights.profile(params.entityId) : null
    const declared = params.country != null && params.country.trim() !== '' ? params.country.trim().toUpperCase() : undefined
    if (profile?.locked === true && declared != null && declared !== profile.country) {
      throw new BillingCountryLocked({ country: profile.country as string, requested: declared })
    }
    const email = await lockedEmailOf(paygate, params)
    let customer = await paygate.customers.ensure(paymentUtils.compact({
      entityId: params.entityId, profileId: params.profileId, service: params.service, locale: params.locale, email,
    }))
    const customerCountry = customer.country?.toUpperCase() ?? undefined
    if (rights != null && policy?.mechanisms.countryLock === true && profile == null && customerCountry != null
      && await consumerRecordsOf(ctx).hasPaid(params.entityId)
      && !await consumerRecordsOf(ctx).wasUnlocked(params.entityId)) {
      // An organization that paid before countries were locked: its saved address is its country.
      // One an operator unlocked is locked again by its next completed purchase instead.
      profile = await rights.lock(params.entityId, customerCountry, 'customer', { customerId: customer.id, paygate: paygate.id })
    }
    if (profile?.locked === true && declared != null && declared !== profile.country) {
      throw new BillingCountryLocked({ country: profile.country as string, requested: declared })
    }
    if (profile?.locked === true && customerCountry != null && customerCountry !== profile.country) {
      throw new BillingCountryLocked({ country: profile.country as string, requested: customerCountry })
    }
    const pinning = (await paygate.customers.locks()).country === true
    const country = profile?.country ?? declared
    if (pinning && country != null && customerCountry !== country) {
      // Pinned: the known country replaces whatever an unlocked customer saved (a locked customer's
      // other country was refused above), so the paygate has nothing else to offer.
      customer = await paygate.customers.setCountry(customer.id, country, { replace: true })
    } else if (policy != null && profile == null && declared != null && customerCountry == null) {
      // Preselect the declared country on the paygate's address form; never over a saved address.
      customer = await paygate.customers.setCountry(customer.id, declared, { replace: false })
    }
    const savedCountry = customer.country?.toUpperCase() ?? undefined
    const kept = savedCountry != null && savedCountry === country && customer.taxLocatable
    const countryPinned = pinning && kept
    const region = policy != null ? consumerRegionHelper.regionOf(country, policy) : null
    const settlement = (await paygate.settlementCurrency())?.toLowerCase()
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

  /** Whether the synced reusable price of a plan can be charged in `currency` (its default or a further currency). */
  const priceCarries = async (
    product: PaymentProduct, plan: PaymentPlan, price: PaygatePrice, currency: string,
  ): Promise<{ carries: boolean, unitAmount?: number }> => {
    if (price.currency === currency) {
      return { carries: true, ...(price.unitAmountMinor != null ? { unitAmount: price.unitAmountMinor } : {}) }
    }
    const listed = price.options[currency]
    if (listed != null) {
      return { carries: true, ...(listed.unitAmountMinor != null ? { unitAmount: listed.unitAmountMinor } : {}) }
    }
    const synced = (await access.fingerprints().bySku(product.sku))?.prices?.find(entry => entry.planSku === plan.sku && entry.priceId === price.id)
    const option = synced?.options.find(entry => entry.currency === currency)

    return option != null ? { carries: true, unitAmount: option.unitAmount } : { carries: false }
  }

  /**
   * Create the session, then tell the plugins it exists. A plugin's `created` that throws expires
   * the fresh session and releases every admission before the error propagates; so does a paygate
   * refusal or a session without a URL.
   */
  const createSession = async (
    paygate: Paygate, plugins: readonly CheckoutPlugin[], attempt: CheckoutAttempt, input: SessionInput,
  ): Promise<string> => {
    const admitted: Admitted[] = await checkoutPluginsOf(ctx).admitCheckout(plugins, attempt)
    const holders = admitted.filter(entry => entry.plugin.admit != null)
    let session: PaygateSession
    try {
      session = await paygate.checkout.createSession(input)
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
          await paygate.checkout.expireSession(session.id)
        } catch (expireError) {
          log.error('Could not expire a checkout a plugin refused', { sessionId: session.id, error: expireError })
        }
        await checkoutPluginsOf(ctx).releaseAdmitted(holders, attempt, session.id)
        throw error
      }
    }

    return session.url
  }

  const createCheckoutLink = async (params: CreateLinkParams, plugins: readonly CheckoutPlugin[] = []): Promise<string> => {
    const paygates = paygatesOf(ctx)
    const product = await access.payment().product(params.productSku) as PaymentProduct
    const plans = (await access.payment().allPlans(product.sku) as PaymentPlan[])
      .filter(plan => paygates.forSale(product, plan, params.paygate).length > 0)
    if (params.planSku != null && !plans.some(plan => plan.sku === params.planSku)) {
      throw new ProductError(`plan:${params.planSku}`)
    }
    const consumable = product.type === ProductType.Consumable
    const plan = consumable
      ? plans.find(item => item.sku === params.planSku) ?? plans[0]
      : plans.find(item => item.sku === params.planSku) ?? plans.find(item => item.recurring != null) ?? plans[0]
    if (plan == null) throw new ProductError('plan')
    const paygate = paygates.forSale(product, plan, params.paygate)[0]
    const catalogueCurrency = (plan.amountPolicy?.currency ?? plan.currency ?? 'usd').toLowerCase()
    const { buyer, customer } = await buyerOf(paygate, params, catalogueCurrency)
    const pricing = await access.payment().pricingPolicy()
    const settlement = (await paygate.settlementCurrency())?.toLowerCase()
    const ttl = checkoutPolicyHelper.sessionTtlOf(plugins, paygate.features.sessionTtl)
    const now = new Date()
    const expiresAt = ttl != null ? new Date((Math.floor(now.getTime() / 1000) + ttl) * 1000) : undefined
    const terms = termsOf(paygate, buyer)
    const base = {
      entityId: params.entityId, productSku: product.sku, planSku: plan.sku, at: now,
      ...(ttl != null ? { sessionTtlSeconds: ttl } : {}), ...(expiresAt != null ? { expiresAt } : {}),
    }
    const shared = {
      entityId: params.entityId, productSku: product.sku, planSku: plan.sku, customerId: customer.id,
      successUrl: params.successUrl, cancelUrl: params.cancelUrl ?? params.successUrl,
      ...(params.locale != null ? { locale: params.locale } : {}),
      ...(expiresAt != null ? { expiresAt } : {}),
      automaticTax: Boolean(pricing.tax.automatic), collectTaxId: Boolean(pricing.tax.collectTaxId),
      keepAddress: buyer.addressLocked, collectTerms: terms.collect,
    }
    const adaptiveOf = (allowed: boolean): boolean => pricing.currency.adaptive === true && allowed

    if (consumable && plan.pricingMode === CheckoutPricingMode.Amount) {
      if (params.amountMinor == null) throw new ProductError('amount')
      if (plan.amountPolicy == null) throw new ProductError(`amount-policy:${plan.sku}`)
      checkoutPricingHelper.assertCheckoutAmount(plan.amountPolicy, params.amountMinor)
      const sourceChargeMinor = checkoutPricingHelper.chargeAmountMinor(params.amountMinor, plan.amountPolicy)
      const amountCurrency = plan.amountPolicy.currency.toLowerCase()
      const view = await checkoutPluginsOf(ctx).narrowAmountFor(plugins, {
        entityId: params.entityId, productSku: product.sku, planSku: plan.sku, base: plan.amountPolicy, at: now,
      })
      checkoutPolicyHelper.assertAmountAllowed(view, params.amountMinor)
      const charged = buyer.chargeCurrency != null
        ? await fxOf(ctx).chargeAmount(paygate, sourceChargeMinor, amountCurrency, buyer.chargeCurrency)
        : await fxOf(ctx).settlementAmount(paygate, sourceChargeMinor, amountCurrency)
      const adaptive = buyer.chargeCurrency == null || charged.currency === (settlement ?? amountCurrency)
      const context = textContextOf(buyer, charged.currency, { unitAmountMinor: charged.amountMinor })
      const submit = submitTextOf(params, context)
        ?? (buyer.policy != null && buyer.inScope && buyer.country != null
          ? consumerCopyHelper.consumerText(buyer.language, 'checkout.top-up', {
            product: product.title, country: consumerFormatHelper.countryName(buyer.country, buyer.language),
          })
          : undefined)

      return await createSession(paygate, plugins, {
        ...base, mode: 'amount', amountMinor: params.amountMinor, amountCurrency, chargeMinor: charged.amountMinor,
        currency: charged.currency,
      }, {
        ...shared, mode: 'amount',
        line: {
          kind: 'amount', productSku: product.sku, currency: charged.currency, unitAmountMinor: charged.amountMinor,
          ...(pricing.tax.behavior != null ? { taxBehavior: pricing.tax.behavior } : {}),
        },
        currency: charged.currency, forceCurrency: false, adaptiveCurrency: adaptiveOf(adaptive),
        texts: paymentUtils.compact({
          submit: submit != null ? limited(paygate, submit, 'submit') : undefined, terms: terms.text,
        }),
        metadata: sharedMetadata(params, product, plan, {
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

    const lookupKey = planHelper.planLookupKey(product, plan)
    if (paygate.catalogue == null) throw new ProductError(`price:${lookupKey}`)
    const price = await paygate.catalogue.price(product.sku, lookupKey)
    const forced = buyer.chargeCurrency != null
      ? await priceCarries(product, plan, price, buyer.chargeCurrency) : { carries: false }
    if (buyer.chargeCurrency != null && !forced.carries) {
      log.warn('Plan has no price in the charge currency; the paygate picks the currency', { plan: plan.sku, currency: buyer.chargeCurrency })
    }
    const currency = forced.carries ? buyer.chargeCurrency as string : price.currency
    const adaptive = buyer.chargeCurrency == null || currency === (settlement ?? price.currency)

    if (consumable) {
      const quantityPolicy = plan.quantityPolicy ?? {
        minimum: plan.minQuantity ?? 1,
        maximum: plan.maxQuantity ?? Math.max(100_000, plan.minQuantity ?? 1),
        default: plan.defaultQuantity ?? plan.minQuantity ?? 1,
      }
      const submit = submitTextOf(params, textContextOf(buyer, currency, paymentUtils.compact({ unitAmountMinor: forced.unitAmount ?? price.unitAmountMinor ?? undefined })))

      return await createSession(paygate, plugins, { ...base, mode: 'quantity', currency }, {
        ...shared, mode: 'quantity',
        line: {
          kind: 'quantity', priceId: price.id, minimum: quantityPolicy.minimum, maximum: quantityPolicy.maximum,
          default: quantityPolicy.default,
        },
        currency, forceCurrency: forced.carries, adaptiveCurrency: adaptiveOf(adaptive),
        texts: paymentUtils.compact({
          submit: submit != null ? limited(paygate, submit, 'submit') : undefined, terms: terms.text,
        }),
        metadata: sharedMetadata(params, product, plan, {
          pricingMode: CheckoutPricingMode.Quantity,
          ...(forced.carries ? { currency } : {}),
          ...consumerMetadata(buyer, params),
        }),
      })
    }

    // A subscription starts services at once: in scope (or unknown and protected) it needs the
    // consumer's express start request, fresh and bound to this organization and plan.
    const start = buyer.policy != null ? await access.consumerRightsOf()?.assertStartRequest(params.entityId, plan.sku, params.startRequestId) ?? null : null
    const unitAmount = forced.unitAmount ?? price.unitAmountMinor ?? undefined
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
    const texts = paymentUtils.compact({
      submit: submit != null ? limited(paygate, submit, 'submit') : undefined,
      afterSubmit: afterSubmit != null ? limited(paygate, afterSubmit, 'after-submit') : undefined,
      terms: terms.text,
    })
    const startRequestId = start?.id ?? undefined
    const metadata = consumerMetadata(buyer, params, startRequestId)

    return await createSession(paygate, plugins, { ...base, mode: 'subscription', currency }, {
      ...shared, mode: 'subscription',
      line: { kind: 'subscription', priceId: price.id },
      currency, forceCurrency: forced.carries, adaptiveCurrency: adaptiveOf(adaptive), texts,
      subscriptionMetadata: {
        pricingMode: CheckoutPricingMode.Quantity, entityId: params.entityId,
        service: params.service, productSku: product.sku, planSku: plan.sku,
        ...(params.profileId != null ? { profileId: params.profileId } : {}),
        ...metadata,
      },
      metadata: sharedMetadata(params, product, plan, metadata),
    })
  }

  return { createCheckoutLink }
}

/** The checkout of a context — one per context. */
export const checkoutOf = memoHelper.oncePer(makeCheckoutHelper)
