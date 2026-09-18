import { describe, expect, test } from 'bun:test'
import { PaygateError, TaxBehavior, TaxEstimateStatus, TaxType } from '@owlmeans/payment'
import { makeEstimateCache, estimateStripePrice } from '../src/plugins/estimate.js'
import { gateway, paygateCustomers } from '../src/utils.js'
import { CREDITS_PRODUCT, makeFakeContext, PLANS_PRODUCT, PRO } from './fake-stripe.js'
import type { FakeContext } from './fake-stripe.js'

const withCustomer = async (
  fake: FakeContext, entityId: string, country: string, taxIds: Array<{ type: string, value: string, country: string }> = [],
  taxExempt: string = 'none',
) => {
  await paygateCustomers(fake.ctx).create({ paygate: 'stripe', externalId: `cus_${entityId}`, entityId })
  fake.state.customers[`cus_${entityId}`] = {
    id: `cus_${entityId}`, object: 'customer', address: { country }, tax_exempt: taxExempt,
    tax_ids: { object: 'list', data: taxIds },
  }
}

const estimatingPolicy = { tax: { automatic: true, collectTaxId: true, estimate: true }, currency: { adaptive: true, estimate: true } }

describe('@owlmeans/server-payment — Stripe Tax price estimate', () => {
  test('taxes the reference amount of a recurring plan at a given country, half-cent rounded up', async () => {
    const fake = await makeFakeContext({
      pricing: estimatingPolicy, stripe: { taxRates: { PL: [{ type: 'vat', percentage: '23' }] } },
    })
    const cache = makeEstimateCache()
    const result = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO, country: 'PL',
    }, cache)
    expect(result).toEqual(expect.objectContaining({
      country: 'PL', source: 'request', currency: 'usd', behavior: TaxBehavior.Exclusive,
    }))
    expect(result.tax).toEqual({
      status: TaxEstimateStatus.Taxed, subtotalMinor: 2_000, taxMinor: 460, totalMinor: 2_460,
      scalable: true, rates: [{ type: TaxType.Vat, percentage: '23', ratePpm: 230_000, country: 'PL' }],
    })
  })

  test('taxes an amount-priced consumable at its default preset, gross-up included', async () => {
    const fake = await makeFakeContext({
      pricing: estimatingPolicy, stripe: { taxRates: { PL: [{ type: 'vat', percentage: '23' }] } },
    })
    const cache = makeEstimateCache()
    const result = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: CREDITS_PRODUCT, country: 'PL',
    }, cache)
    // the credit unit's default preset is 1_000, grossed up to 1_021 by its own amount policy
    expect(result.tax.subtotalMinor).toBe(1_021)
    expect(result.tax.taxMinor).toBe(235)
    expect(result.tax.totalMinor).toBe(1_256)
  })

  test('no request country and no paygate customer: `location-required`, zero Stripe calls', async () => {
    const fake = await makeFakeContext({ pricing: estimatingPolicy })
    const cache = makeEstimateCache()
    const result = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'unknown-entity', productSku: PLANS_PRODUCT, planSku: PRO,
    }, cache)
    expect(result.tax.status).toBe(TaxEstimateStatus.LocationRequired)
    expect(fake.state.calls).not.toContain('tax.calculations.create')
  })

  test("falls back to the entity's paygate customer address, tagged `source: 'customer'`", async () => {
    const fake = await makeFakeContext({
      pricing: estimatingPolicy, stripe: { taxRates: { DE: [{ type: 'vat', percentage: '19' }] } },
    })
    await withCustomer(fake, 'entity-1', 'DE')
    const result = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO,
    }, makeEstimateCache())
    expect(result.country).toBe('DE')
    expect(result.source).toBe('customer')
    expect(result.tax.status).toBe(TaxEstimateStatus.Taxed)
  })

  test('a saved tax id for a DIFFERENT country than the resolved one is never sent', async () => {
    const fake = await makeFakeContext({
      pricing: estimatingPolicy, stripe: { taxRates: { PL: [{ type: 'vat', percentage: '23' }] } },
    })
    await withCustomer(fake, 'entity-1', 'PL', [{ type: 'eu_vat', value: 'DE123456789', country: 'DE' }])
    const result = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO,
    }, makeEstimateCache())
    // taxed, not reverse-charged — the DE tax id never reached the calculation
    expect(result.tax.status).toBe(TaxEstimateStatus.Taxed)
    expect(fake.state.taxCalculations[0].customer_details.tax_ids).toBeUndefined()
  })

  test('a matching-country tax id triggers reverse charge, with zero tax', async () => {
    const fake = await makeFakeContext({
      pricing: estimatingPolicy, stripe: { taxRates: { DE: [{ type: 'vat', percentage: '19' }] } },
    })
    await withCustomer(fake, 'entity-1', 'DE', [{ type: 'eu_vat', value: 'DE123456789', country: 'DE' }])
    const result = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO,
    }, makeEstimateCache())
    expect(result.tax.status).toBe(TaxEstimateStatus.ReverseCharge)
    expect(result.tax.taxMinor).toBe(0)
    expect(result.tax.totalMinor).toBe(2_000)
  })

  test('an unconfigured country (no registration) reads `none`', async () => {
    const fake = await makeFakeContext({ pricing: estimatingPolicy })
    const result = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO, country: 'FR',
    }, makeEstimateCache())
    expect(result.tax.status).toBe(TaxEstimateStatus.None)
    expect(result.tax.taxMinor).toBe(0)
  })

  test('a jurisdiction Stripe Tax does not cover reads `at-checkout`', async () => {
    const fake = await makeFakeContext({ pricing: estimatingPolicy, stripe: { taxUnsupportedCountries: ['CU'] } })
    const result = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO, country: 'CU',
    }, makeEstimateCache())
    expect(result.tax.status).toBe(TaxEstimateStatus.AtCheckout)
  })

  test('a Stripe invalid-request error (e.g. US missing a postal code) reads `at-checkout`, and the outcome is cached', async () => {
    const fake = await makeFakeContext({ pricing: estimatingPolicy, stripe: { taxInvalidCountries: ['US'] } })
    const cache = makeEstimateCache()
    const first = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO, country: 'US',
    }, cache)
    expect(first.tax.status).toBe(TaxEstimateStatus.AtCheckout)
    const callsAfterFirst = fake.state.calls.filter(name => name === 'tax.calculations.create').length
    await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO, country: 'US',
    }, cache)
    expect(fake.state.calls.filter(name => name === 'tax.calculations.create')).toHaveLength(callsAfterFirst)
  })

  test('an identical request within the cache TTL makes exactly one Stripe Tax call; a different entity with its own tax id makes another', async () => {
    const fake = await makeFakeContext({ pricing: estimatingPolicy, stripe: { taxRates: { PL: [{ type: 'vat', percentage: '23' }] } } })
    const cache = makeEstimateCache()
    const params = { entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO, country: 'PL' }
    await estimateStripePrice(fake.ctx, fake.stripe, params, cache)
    await estimateStripePrice(fake.ctx, fake.stripe, params, cache)
    expect(fake.state.taxCalculations).toHaveLength(1)

    await withCustomer(fake, 'entity-2', 'PL', [{ type: 'eu_vat', value: 'PL123456789', country: 'PL' }])
    await estimateStripePrice(fake.ctx, fake.stripe, { ...params, entityId: 'entity-2' }, cache)
    expect(fake.state.taxCalculations).toHaveLength(2)
  })

  test('never caches a rate-limit or connection error', async () => {
    let fail = true
    const fake = await makeFakeContext({ pricing: estimatingPolicy, stripe: { taxRates: { PL: [{ type: 'vat', percentage: '23' }] } } })
    const cache = makeEstimateCache()
    const original = (fake.stripe as never as { tax: { calculations: { create: (...args: unknown[]) => unknown } } })
      .tax.calculations.create
    ;(fake.stripe as never as { tax: { calculations: { create: (...args: unknown[]) => unknown } } })
      .tax.calculations.create = async (...args: unknown[]) => {
        if (fail) { fail = false; throw new Error('connection reset') }
        return await original(...args)
      }
    const params = { entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO, country: 'PL' }
    await expect(estimateStripePrice(fake.ctx, fake.stripe, params, cache)).rejects.toThrow('connection reset')
    const result = await estimateStripePrice(fake.ctx, fake.stripe, params, cache)
    expect(result.tax.status).toBe(TaxEstimateStatus.Taxed)
  })

  test('carries a local-currency conversion from the FX Quotes API, requested to_currency=usd from_currencies=[local]', async () => {
    const fake = await makeFakeContext({
      pricing: estimatingPolicy,
      stripe: { taxRates: { PL: [{ type: 'vat', percentage: '23' }] }, fxRates: { pln: { exchangeRate: 0.25, fxFeeRate: 0.02 } } },
    })
    const result = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO, country: 'PL',
    }, makeEstimateCache())
    expect(result.local).toEqual({ currency: 'pln', exchangeRate: 0.25, fxFeeRate: 0.02 })
    expect(fake.state.rawRequests[0]).toEqual(expect.objectContaining({
      method: 'POST', path: '/v1/fx_quotes', params: { to_currency: 'usd', 'from_currencies[]': 'pln', lock_duration: 'none' },
    }))
  })

  test('omits `local` when the FX Quotes call fails, without failing the estimate', async () => {
    const fake = await makeFakeContext({
      pricing: estimatingPolicy, stripe: { taxRates: { PL: [{ type: 'vat', percentage: '23' }] }, fxUnavailable: true },
    })
    const result = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO, country: 'PL',
    }, makeEstimateCache())
    expect(result.tax.status).toBe(TaxEstimateStatus.Taxed)
    expect(result.local).toBeUndefined()
  })

  test('omits `local` for a US billing country (same currency as the integration currency), with no FX call', async () => {
    const fake = await makeFakeContext({ pricing: estimatingPolicy })
    const result = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO, country: 'US',
    }, makeEstimateCache())
    expect(result.local).toBeUndefined()
    expect(fake.state.rawRequests).toHaveLength(0)
  })

  test('`currency.estimate: false` never computes a local total, even with `currency.adaptive: true`', async () => {
    const fake = await makeFakeContext({
      pricing: {
        tax: { automatic: true, collectTaxId: true, estimate: true },
        currency: { adaptive: true, estimate: false },
      },
      stripe: { taxRates: { PL: [{ type: 'vat', percentage: '23' }] }, fxRates: { pln: { exchangeRate: 0.25 } } },
    })
    const result = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO, country: 'PL',
    }, makeEstimateCache())
    expect(result.local).toBeUndefined()
    expect(fake.state.rawRequests).toHaveLength(0)
  })

  test('an unmanaged gateway throws PaygateError before ever reaching Stripe', async () => {
    const fake = await makeFakeContext({ pricing: estimatingPolicy })
    await expect(gateway(fake.ctx).estimatePrice(fake.ctx, {
      entityId: 'entity-1', productSku: PLANS_PRODUCT, planSku: PRO,
    })).rejects.toBeInstanceOf(PaygateError)
  })
})
