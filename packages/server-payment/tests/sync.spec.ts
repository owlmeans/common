import { describe, expect, test } from 'bun:test'
import { TaxBehavior } from '@owlmeans/payment'
import type { PricingDef } from '../src/types.js'
import { syncStripeProducts } from '../src/sync.js'
import { makeFakeContext, PLANS_PRODUCT, PRO } from './fake-stripe.js'
import type { FakeContextOptions } from './fake-stripe.js'

const exclusive: PricingDef = {
  tax: { automatic: true, collectTaxId: true, estimate: false, behavior: TaxBehavior.Exclusive },
  currency: { estimate: false },
}

const inclusiveAccountDefault = {
  defaults: { tax_behavior: 'inclusive' as const, tax_code: null }, head_office: null,
  status: 'active' as const, status_details: {},
}

/** A price already in place, matching PRO's lookup key, amount, currency and interval. */
const existingProPrice = (taxBehavior: string, id = 'price_pro_existing') => ({
  id, product: PLANS_PRODUCT, lookup_key: PRO, active: true, unit_amount: 2_000, currency: 'usd',
  recurring: { interval: 'month' }, tax_behavior: taxBehavior,
})

const withProProduct = async (opts: FakeContextOptions = {}) => await makeFakeContext(opts)
const proPrice = (fake: Awaited<ReturnType<typeof withProProduct>>) =>
  fake.state.prices.find(item => item.lookup_key === PRO && item.active)

describe('@owlmeans/server-payment — price tax_behavior sync', () => {
  test('an undeclared policy creates a price with no forced tax_behavior (Stripe defaults it to unspecified)', async () => {
    const fake = await withProProduct()
    await syncStripeProducts(fake.ctx, fake.stripe)
    expect(proPrice(fake)?.tax_behavior).toBe('unspecified')
  })

  test('re-syncing an unchanged, undeclared catalogue makes no paygate call', async () => {
    const fake = await withProProduct()
    await syncStripeProducts(fake.ctx, fake.stripe)
    fake.state.calls.length = 0
    await syncStripeProducts(fake.ctx, fake.stripe)
    expect(fake.state.calls).toEqual([])
  })

  test('a declared behavior sets tax_behavior on a freshly created price', async () => {
    const fake = await withProProduct({ pricing: exclusive })
    await syncStripeProducts(fake.ctx, fake.stripe)
    expect(proPrice(fake)?.tax_behavior).toBe('exclusive')
  })

  test("a declared behavior updates a pre-existing 'unspecified' price IN PLACE — the id is kept", async () => {
    const fake = await withProProduct({ pricing: exclusive, stripe: { prices: [existingProPrice('unspecified')] } })
    await syncStripeProducts(fake.ctx, fake.stripe)
    expect(fake.state.calls).toContain('prices.update')
    // PRO's own price keeps its id (an update, not a replacement) — TEAM's plan has no price
    // fixture, so it legitimately goes through `prices.create` alongside it.
    expect(proPrice(fake)).toEqual(expect.objectContaining({ id: 'price_pro_existing', tax_behavior: 'exclusive' }))
  })

  test("an inclusive account default skips the in-place update and leaves the price 'unspecified'", async () => {
    const fake = await withProProduct({
      pricing: exclusive, stripe: { prices: [existingProPrice('unspecified')], taxSettings: inclusiveAccountDefault },
    })
    await syncStripeProducts(fake.ctx, fake.stripe)
    expect(fake.state.calls).toContain('tax.settings.retrieve')
    expect(fake.state.calls).not.toContain('prices.update')
    expect(proPrice(fake)?.tax_behavior).toBe('unspecified')
  })

  test("'stripe.migrateUnspecifiedPrices' overrides the account-default guard, without even checking it", async () => {
    const fake = await withProProduct({
      pricing: { ...exclusive, stripe: { migrateUnspecifiedPrices: true } },
      stripe: { prices: [existingProPrice('unspecified')], taxSettings: inclusiveAccountDefault },
    })
    await syncStripeProducts(fake.ctx, fake.stripe)
    expect(fake.state.calls).not.toContain('tax.settings.retrieve')
    expect(proPrice(fake)?.tax_behavior).toBe('exclusive')
  })

  test('a price already carrying the OPPOSITE behavior is deactivated and replaced, never mutated', async () => {
    const fake = await withProProduct({ pricing: exclusive, stripe: { prices: [existingProPrice('inclusive')] } })
    await syncStripeProducts(fake.ctx, fake.stripe)
    const old = fake.state.prices.find(item => item.id === 'price_pro_existing')
    const fresh = proPrice(fake)
    expect(old?.active).toBe(false)
    expect(old?.tax_behavior).toBe('inclusive')
    expect(fresh?.id).not.toBe('price_pro_existing')
    expect(fresh).toEqual(expect.objectContaining({ tax_behavior: 'exclusive', lookup_key: PRO }))
  })

  test('recurring USD catalogue prices are synchronized as EUR settlement prices', async () => {
    const fake = await withProProduct({
      pricing: { ...exclusive, stripe: { settlementCurrency: 'eur' } },
      stripe: { fxRates: { usd: { exchangeRate: 0.853568, referenceRate: 0.8726 } } },
    })
    await syncStripeProducts(fake.ctx, fake.stripe)
    expect(proPrice(fake)).toEqual(expect.objectContaining({ currency: 'eur', unit_amount: 1_746 }))
    expect(fake.state.rawRequests).toContainEqual(expect.objectContaining({
      params: { to_currency: 'eur', 'from_currencies[]': 'usd', lock_duration: 'none' },
    }))
  })

  test('a changed reference rate replaces a recurring settlement price on the next sync', async () => {
    const fake = await withProProduct({
      pricing: { ...exclusive, stripe: { settlementCurrency: 'eur' } },
      stripe: { fxRates: { usd: { exchangeRate: 0.853568, referenceRate: 0.8726 } } },
    })
    await syncStripeProducts(fake.ctx, fake.stripe)
    const first = proPrice(fake)
    fake.state.fxRates.usd = { exchangeRate: 0.88, referenceRate: 0.9 }
    await syncStripeProducts(fake.ctx, fake.stripe)
    expect(first?.active).toBe(false)
    expect(proPrice(fake)).toEqual(expect.objectContaining({ currency: 'eur', unit_amount: 1_800 }))
    expect(proPrice(fake)?.id).not.toBe(first?.id)
  })
})
