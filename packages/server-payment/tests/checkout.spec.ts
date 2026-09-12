import { describe, expect, test } from 'bun:test'
import { CheckoutPricingMode, PlanDuration, PlanStatus, ProductType } from '@owlmeans/payment'
import { PAYMENT_OBSERVER, RES_PAYMENT_SUBSCRIPTION } from '../src/consts.js'
import { createEventHandler } from '../src/plugins/events.js'
import { amountCheckoutLineItem, quantityCheckoutLineItem } from '../src/plugins/stripe.js'
import type { PaymentPlan, PaymentProduct, PaymentSubscriptionRecord, TopUpCompletion } from '../src/types.js'

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
  currency: 'usd', amount_subtotal: 1021,
  metadata: {
    pricingMode: 'amount', amountMinor: '1000', chargeAmountMinor: '1021', currency: 'usd',
    entityId: 'entity-1', service: 'app', productSku: 'credits', planSku: 'credits-unit',
  },
  ...overrides,
})

const harness = () => {
  const records: PaymentSubscriptionRecord[] = []
  const completions: TopUpCompletion[] = []
  const subscriptions = {
    byExternalId: async (id: string) => records.find(record => record.externalId === id) ?? null,
    create: async (record: PaymentSubscriptionRecord) => {
      const created = { ...record, id: String(records.length + 1) }
      records.push(created)
      return created
    },
    save: async (record: PaymentSubscriptionRecord) => {
      const index = records.findIndex(item => item.id === record.id)
      records[index] = { ...record }
      return records[index]
    },
  }
  const observer = { propagateTopUp: async (completion: TopUpCompletion) => { completions.push(completion) } }
  const context = {
    resource: (alias: string) => alias === RES_PAYMENT_SUBSCRIPTION ? subscriptions : undefined,
    service: (alias: string) => alias === PAYMENT_OBSERVER ? observer : undefined,
  }
  const stripe = { checkout: { sessions: { listLineItems: async () => ({ data: [{ quantity: 7 }] }) } } }
  return { records, completions, context, stripe }
}

describe('Stripe amount checkout', () => {
  test('uses one inline, tax-exclusive item and no reusable Price', () => {
    const result = amountCheckoutLineItem(product, plan, 1_000)
    expect(result.chargeMinor).toBe(1_021)
    expect(result.lineItem).toEqual({
      price_data: { product: 'credits', currency: 'usd', unit_amount: 1_021, tax_behavior: 'exclusive' },
      quantity: 1,
    })
    expect(result.lineItem.adjustable_quantity).toBeUndefined()
  })

  test('keeps reusable Price and adjustable quantity for quantity checkout', () => {
    expect(quantityCheckoutLineItem({ id: 'price_1' } as never, {
      minimum: 5, maximum: 500, default: 10,
    })).toEqual({
      price: 'price_1', quantity: 10,
      adjustable_quantity: { enabled: true, minimum: 5, maximum: 500 },
    })
  })

  test('fulfills a paid amount without crediting the adjustment', async () => {
    const h = harness()
    await createEventHandler(h.context as never, h.stripe as never).process({
      type: 'checkout.session.completed', data: { object: paid() },
    } as never)
    expect(h.completions).toEqual([expect.objectContaining({ mode: 'amount', amountMinor: 1_000, chargeAmountMinor: 1_021 })])
    expect(h.records[0]?.fulfilledAt).toBeInstanceOf(Date)
  })

  test('does not fulfill an unpaid completion; asynchronous success does', async () => {
    const h = harness()
    const handler = createEventHandler(h.context as never, h.stripe as never)
    await handler.process({
      type: 'checkout.session.completed', data: { object: paid({ payment_status: 'unpaid' }) },
    } as never)
    expect(h.completions).toHaveLength(0)
    await handler.process({ type: 'checkout.session.async_payment_succeeded', data: { object: paid() } } as never)
    expect(h.completions).toHaveLength(1)
  })

  test('rejects currency/subtotal metadata mismatches and is idempotent on retries', async () => {
    const h = harness()
    const handler = createEventHandler(h.context as never, h.stripe as never)
    await expect(handler.process({
      type: 'checkout.session.completed', data: { object: paid({ amount_subtotal: 1020 }) },
    } as never)).rejects.toThrow()
    await handler.process({ type: 'checkout.session.completed', data: { object: paid() } } as never)
    await handler.process({ type: 'checkout.session.completed', data: { object: paid() } } as never)
    expect(h.completions).toHaveLength(1)
  })

  test('retries fulfillment when the application observer fails', async () => {
    const h = harness()
    let attempts = 0
    ;(h.context.service(PAYMENT_OBSERVER) as never as { propagateTopUp: () => Promise<void> })
      .propagateTopUp = async () => {
        attempts++
        if (attempts === 1) throw new Error('ledger unavailable')
        h.completions.push({ mode: 'amount' } as never)
      }
    const handler = createEventHandler(h.context as never, h.stripe as never)
    const event = { type: 'checkout.session.completed', data: { object: paid() } } as never
    await expect(handler.process(event)).rejects.toThrow('ledger unavailable')
    expect(h.records[0]?.fulfilledAt).toBeUndefined()
    await handler.process(event)
    expect(attempts).toBe(2)
    expect(h.records[0]?.fulfilledAt).toBeInstanceOf(Date)
  })

  test('legacy sessions without pricing metadata still fulfill by quantity', async () => {
    const h = harness()
    const legacy = paid({ id: 'cs_legacy', metadata: {
      entityId: 'entity-1', service: 'app', productSku: 'credits', planSku: 'credits-unit',
    } })
    await createEventHandler(h.context as never, h.stripe as never).process({
      type: 'checkout.session.completed', data: { object: legacy },
    } as never)
    expect(h.completions[0]).toEqual(expect.objectContaining({ mode: 'quantity', units: 7 }))
  })
})
