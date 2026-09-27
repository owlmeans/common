import { describe, expect, test } from 'bun:test'
import { CheckoutPricingMode, PlanDuration, PlanStatus, ProductError, ProductType, TaxBehavior } from '@owlmeans/payment'
import { createEventHandler } from '../src/plugins/events.js'
import { amountCheckoutLineItem, createCheckoutLink, quantityCheckoutLineItem } from '../src/plugins/stripe.js'
import type { PaymentPlan, PaymentProduct } from '../src/types.js'
import { CREDITS_PRODUCT, FREE, makeFakeContext, PLANS_PRODUCT, PRO, TEAM } from './fake-stripe.js'
import type { FakeContext } from './fake-stripe.js'

const proPrice = { id: 'price_pro', product: PLANS_PRODUCT, lookup_key: PRO, active: true, recurring: { interval: 'month' } }
const successUrl = 'https://app.example.com/ok'

const product: PaymentProduct = {
  type: ProductType.Consumable, sku: 'credits', title: 'Credits', services: ['app'],
}
const plan: PaymentPlan = {
  productSku: product.sku, sku: 'credits-unit', title: 'Credits', status: PlanStatus.Active,
  duration: PlanDuration.Consumable, price: 0.02, currency: 'usd',
  pricingMode: CheckoutPricingMode.Amount,
  amountPolicy: {
    currency: 'usd', minimumMinor: 500, maximumMinor: 50_000, defaultMinor: 1_000,
    presetsMinor: [1_000, 2_000, 5_000, 10_000], fixedMinor: 0, rateBps: 200,
  },
}

const paid = (overrides: Record<string, unknown> = {}) => ({
  id: 'cs_amount', mode: 'payment', payment_status: 'paid', customer: 'cus_1',
  currency: 'usd', amount_subtotal: 1021, payment_intent: 'pi_1', invoice: 'in_1',
  metadata: {
    pricingMode: 'amount', amountMinor: '1000', chargeAmountMinor: '1021', currency: 'usd',
    entityId: 'entity-1', service: 'app', productSku: CREDITS_PRODUCT, planSku: 'app-credit-unit',
  },
  ...overrides,
})

const process = async (fake: FakeContext, type: string, object: unknown) =>
  await createEventHandler(fake.ctx, fake.stripe).process({ type, data: { object } } as never)
const fulfillment = (fake: FakeContext) => fake.stores['payment-fulfillment'].rows

describe('Stripe checkout', () => {
  test('amount checkout uses one inline, tax-exclusive item and no reusable Price', () => {
    const result = amountCheckoutLineItem(product, plan, 1_000)
    expect(result.chargeMinor).toBe(1_021)
    expect(result.lineItem).toEqual({
      price_data: { product: 'credits', currency: 'usd', unit_amount: 1_021, tax_behavior: 'exclusive' },
      quantity: 1,
    })
    expect(result.lineItem.adjustable_quantity).toBeUndefined()
  })

  test('quantity checkout keeps a reusable Price and an adjustable quantity', () => {
    expect(quantityCheckoutLineItem({ id: 'price_1' } as never, {
      minimum: 5, maximum: 500, default: 10,
    })).toEqual({
      price: 'price_1', quantity: 10,
      adjustable_quantity: { enabled: true, minimum: 5, maximum: 500 },
    })
  })

  test('a subscription checkout takes the asked plan, locale and disclosure; a free plan is never checked out', async () => {
    const fake = await makeFakeContext({
      stripe: { prices: [{ id: 'price_team', product: PLANS_PRODUCT, lookup_key: TEAM, active: true, recurring: { interval: 'month' } }] },
    })
    await createCheckoutLink(fake.ctx, fake.stripe, {
      productSku: PLANS_PRODUCT, planSku: TEAM, entityId: 'entity-1', service: 'app', successUrl: 'https://app.example.com/ok',
      locale: 'fr', submitText: 'Comprend des crédits prépayés obligatoires.',
    })
    expect(fake.state.checkoutSessions[0]).toEqual(expect.objectContaining({
      mode: 'subscription', line_items: [{ price: 'price_team', quantity: 1 }],
      locale: 'fr', custom_text: { submit: { message: 'Comprend des crédits prépayés obligatoires.' } },
    }))
    expect(fake.state.checkoutSessions[0].subscription_data.metadata).toEqual(expect.objectContaining({ entityId: 'entity-1', planSku: TEAM }))
    expect(fake.state.customers.cus_1.preferred_locales).toEqual(['fr'])

    await expect(createCheckoutLink(fake.ctx, fake.stripe, {
      productSku: PLANS_PRODUCT, planSku: FREE, entityId: 'entity-1', service: 'app',
    })).rejects.toBeInstanceOf(ProductError)
  })
})

describe('Stripe checkout — pricing policy', () => {
  test('an undeclared policy reproduces exactly the session hard-coded before this policy existed', async () => {
    const fake = await makeFakeContext({ stripe: { prices: [proPrice] } })
    await createCheckoutLink(fake.ctx, fake.stripe, {
      productSku: PLANS_PRODUCT, planSku: PRO, entityId: 'entity-1', service: 'app', successUrl,
    })
    const session = fake.state.checkoutSessions[0]
    expect(session).toEqual(expect.objectContaining({
      automatic_tax: { enabled: true }, billing_address_collection: 'required',
      tax_id_collection: { enabled: true }, customer_update: { address: 'auto', name: 'auto' },
    }))
    expect(session.adaptive_pricing).toBeUndefined()
  })

  test('tax.automatic and tax.collectTaxId are independent switches', async () => {
    const fake = await makeFakeContext({
      pricing: { tax: { automatic: false, collectTaxId: true, estimate: false }, currency: { estimate: false } },
      stripe: { prices: [proPrice] },
    })
    await createCheckoutLink(fake.ctx, fake.stripe, {
      productSku: PLANS_PRODUCT, planSku: PRO, entityId: 'entity-1', service: 'app', successUrl,
    })
    const session = fake.state.checkoutSessions[0]
    expect(session.automatic_tax).toBeUndefined()
    expect(session.billing_address_collection).toBeUndefined()
    expect(session.tax_id_collection).toEqual({ enabled: true })
    // only the concern that needs it contributes a `customer_update` field
    expect(session.customer_update).toEqual({ name: 'auto' })
  })

  test('adaptive_pricing appears on the session only when currency.adaptive is declared', async () => {
    const fake = await makeFakeContext({
      pricing: { tax: { automatic: true, collectTaxId: true, estimate: false }, currency: { adaptive: true, estimate: false } },
      stripe: { prices: [proPrice] },
    })
    await createCheckoutLink(fake.ctx, fake.stripe, {
      productSku: PLANS_PRODUCT, planSku: PRO, entityId: 'entity-1', service: 'app', successUrl,
    })
    expect(fake.state.checkoutSessions[0].adaptive_pricing).toEqual({ enabled: true })
  })

  test('subscription checkout can explicitly offer recurring-capable payment methods', async () => {
    const fake = await makeFakeContext({
      pricing: {
        tax: { automatic: true, collectTaxId: true, estimate: false }, currency: { estimate: false },
        stripe: { subscriptionPaymentMethodTypes: ['CARD', 'link', 'klarna'] },
      },
      stripe: { prices: [proPrice] },
    })
    await createCheckoutLink(fake.ctx, fake.stripe, {
      productSku: PLANS_PRODUCT, planSku: PRO, entityId: 'entity-1', service: 'app', successUrl,
    })
    expect(fake.state.checkoutSessions[0].payment_method_types).toEqual(['card', 'link', 'klarna'])
  })

  test('a declared behavior is set on the inline amount line item', async () => {
    const fake = await makeFakeContext({
      pricing: { tax: { automatic: true, collectTaxId: true, estimate: false, behavior: TaxBehavior.Inclusive }, currency: { estimate: false } },
    })
    await createCheckoutLink(fake.ctx, fake.stripe, {
      productSku: CREDITS_PRODUCT, entityId: 'entity-1', service: 'app', amountMinor: 1_000, successUrl,
    })
    expect(fake.state.checkoutSessions[0].line_items[0].price_data.tax_behavior).toBe('inclusive')
  })

  test('an amount checkout converts the USD catalogue charge to the settlement currency', async () => {
    const fake = await makeFakeContext({
      pricing: {
        tax: { automatic: true, collectTaxId: true, estimate: false },
        currency: { adaptive: true, estimate: false }, stripe: { settlementCurrency: 'EUR' },
      },
      stripe: { fxRates: { usd: { exchangeRate: 0.853568, referenceRate: 0.8726 } } },
    })
    await createCheckoutLink(fake.ctx, fake.stripe, {
      productSku: CREDITS_PRODUCT, entityId: 'entity-1', service: 'app', amountMinor: 1_000, successUrl,
    })
    const session = fake.state.checkoutSessions[0]
    expect(session.line_items[0].price_data).toEqual(expect.objectContaining({ currency: 'eur', unit_amount: 891 }))
    expect(session.metadata).toEqual(expect.objectContaining({
      amountMinor: '1000', sourceChargeAmountMinor: '1021', amountCurrency: 'usd',
      chargeAmountMinor: '891', currency: 'eur',
    }))
    expect(fake.state.rawRequests[0]).toEqual(expect.objectContaining({
      params: { to_currency: 'eur', 'from_currencies[]': 'usd', lock_duration: 'none' },
    }))
  })
})

describe('Stripe checkout fulfillment', () => {
  test('fulfills a paid amount once even when the session carries Adaptive Pricing presentment details', async () => {
    const fake = await makeFakeContext()
    await process(fake, 'checkout.session.completed', paid({
      presentment_details: { presentment_amount: 4_613, presentment_currency: 'eur' },
    }))
    expect(fake.observed.topUp).toEqual([expect.objectContaining({ amountMinor: 1_000, chargeAmountMinor: 1_021 })])
  })

  test('fulfills a paid amount once, without crediting the adjustment, and records the payment intent', async () => {
    const fake = await makeFakeContext()
    await process(fake, 'checkout.session.completed', paid())
    await process(fake, 'checkout.session.completed', paid())
    expect(fake.observed.topUp).toEqual([expect.objectContaining({
      mode: 'amount', amountMinor: 1_000, chargeAmountMinor: 1_021, externalId: 'cs_amount', entityId: 'entity-1',
    })])
    expect(fulfillment(fake)[0]).toEqual(expect.objectContaining({
      externalId: 'cs_amount', paymentIntentId: 'pi_1', invoiceId: 'in_1', mode: 'amount',
    }))
    expect(fulfillment(fake)[0].fulfilledAt).toBeInstanceOf(Date)
    expect(fake.stores['payment-subscription'].rows).toHaveLength(0)
  })

  test('fulfills the USD credit value from an EUR settlement charge', async () => {
    const fake = await makeFakeContext()
    await process(fake, 'checkout.session.completed', paid({
      currency: 'eur', amount_subtotal: 891,
      metadata: {
        pricingMode: 'amount', amountMinor: '1000', sourceChargeAmountMinor: '1021', amountCurrency: 'usd',
        chargeAmountMinor: '891', currency: 'eur', entityId: 'entity-1', service: 'app',
        productSku: CREDITS_PRODUCT, planSku: 'app-credit-unit',
      },
    }))
    expect(fake.observed.topUp[0]).toEqual(expect.objectContaining({
      amountMinor: 1_000, sourceChargeAmountMinor: 1_021, amountCurrency: 'usd',
      chargeAmountMinor: 891, currency: 'eur',
    }))
    expect(fulfillment(fake)[0]).toEqual(expect.objectContaining({ amountCurrency: 'usd', currency: 'eur' }))
  })

  test('grants nothing for an unpaid completion; the asynchronous success does', async () => {
    const fake = await makeFakeContext()
    await process(fake, 'checkout.session.completed', paid({ payment_status: 'unpaid' }))
    expect(fake.observed.topUp).toHaveLength(0)
    await process(fake, 'checkout.session.async_payment_succeeded', paid())
    expect(fake.observed.topUp).toHaveLength(1)
  })

  test('rejects a currency or subtotal mismatch; retries after a failed observer', async () => {
    const fake = await makeFakeContext()
    await expect(process(fake, 'checkout.session.completed', paid({ amount_subtotal: 1020 }))).rejects.toThrow()

    fake.observed.failTopUp = 1
    await expect(process(fake, 'checkout.session.completed', paid())).rejects.toThrow('ledger unavailable')
    expect(fulfillment(fake)[0]?.fulfilledAt).toBeUndefined()
    await process(fake, 'checkout.session.completed', paid())
    expect(fake.observed.topUp).toHaveLength(1)
    expect(fulfillment(fake)[0].fulfilledAt).toBeInstanceOf(Date)
  })

  test('a legacy session without pricing metadata fulfills by quantity', async () => {
    const fake = await makeFakeContext()
    await process(fake, 'checkout.session.completed', paid({
      id: 'cs_legacy', metadata: { entityId: 'entity-1', service: 'app', productSku: CREDITS_PRODUCT, planSku: 'app-credit-unit' },
    }))
    expect(fake.observed.topUp[0]).toEqual(expect.objectContaining({ mode: 'quantity', units: 7 }))
    expect(fulfillment(fake)[0]).toEqual(expect.objectContaining({ mode: 'quantity', units: 7 }))
  })
})
