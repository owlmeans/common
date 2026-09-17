import { describe, expect, test } from 'bun:test'
import { CheckoutPricingMode, PlanDuration, PlanStatus, ProductError, ProductType } from '@owlmeans/payment'
import { createEventHandler } from '../src/plugins/events.js'
import { amountCheckoutLineItem, createCheckoutLink, quantityCheckoutLineItem } from '../src/plugins/stripe.js'
import type { PaymentPlan, PaymentProduct } from '../src/types.js'
import { CREDITS_PRODUCT, FREE, makeFakeContext, PLANS_PRODUCT, TEAM } from './fake-stripe.js'
import type { FakeContext } from './fake-stripe.js'

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

  test('a subscription checkout takes the asked plan; a free plan is never checked out', async () => {
    const fake = await makeFakeContext({
      stripe: { prices: [{ id: 'price_team', product: PLANS_PRODUCT, lookup_key: TEAM, active: true, recurring: { interval: 'month' } }] },
    })
    await createCheckoutLink(fake.ctx, fake.stripe, {
      productSku: PLANS_PRODUCT, planSku: TEAM, entityId: 'entity-1', service: 'app', successUrl: 'https://app.example.com/ok',
    })
    expect(fake.state.checkoutSessions[0]).toEqual(expect.objectContaining({
      mode: 'subscription', line_items: [{ price: 'price_team', quantity: 1 }],
    }))
    expect(fake.state.checkoutSessions[0].subscription_data.metadata).toEqual(expect.objectContaining({ entityId: 'entity-1', planSku: TEAM }))

    await expect(createCheckoutLink(fake.ctx, fake.stripe, {
      productSku: PLANS_PRODUCT, planSku: FREE, entityId: 'entity-1', service: 'app',
    })).rejects.toBeInstanceOf(ProductError)
  })
})

describe('Stripe checkout fulfillment', () => {
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
