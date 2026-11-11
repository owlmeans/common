import { describe, expect, test } from 'bun:test'
import { CheckoutPricingMode, PaygateError, PlanDuration, UnknownPaygate } from '@owlmeans/payment'
import {
  CREDIT_UNIT, CREDITS_PRODUCT, FREE, makeFakeContext, makeFakePaygate, PLANS_PRODUCT, PRO,
} from '@owlmeans/test-payment'
import {
  ensurePaymentProviders, makePaygateRegistry, paygateBootstrapOf, paygatesOf, paymentAccessOf, PAYMENT_PROVIDERS,
  type PaymentPlan, type PaymentProduct,
} from '../src/index.js'

const planOf = async (ctx: Parameters<typeof paymentAccessOf>[0], sku: string): Promise<{ product: PaymentProduct, plan: PaymentPlan }> => {
  const plan = await paymentAccessOf(ctx).payment().plan(sku) as PaymentPlan
  const product = await paymentAccessOf(ctx).payment().product(plan.productSku) as PaymentProduct

  return { product, plan }
}

describe('@owlmeans/server-payment — payment providers and the paygate registry', () => {
  test('providers keep their registration order; one registered under a taken id replaces it and is bound anew', async () => {
    const one = makeFakePaygate({ id: 'one' })
    const two = makeFakePaygate({ id: 'two' })
    const fake = await makeFakeContext({ providers: [one.provider, two.provider] })
    const registry = paygatesOf(fake.ctx)
    const before = registry.get('one')

    expect(registry.all().map(paygate => paygate.id)).toEqual(['one', 'two'])
    expect(registry.get('one')).toBe(before)

    const replacement = makeFakePaygate({ id: 'one' })
    ensurePaymentProviders(fake.ctx as never).register(replacement.provider)
    expect(registry.all().map(paygate => paygate.id)).toEqual(['one', 'two'])
    expect(registry.get('one')).not.toBe(before)
    expect(ensurePaymentProviders(fake.ctx as never).provider('one')).toBe(replacement.provider)
    expect(() => ensurePaymentProviders(fake.ctx as never).register({ ...replacement.provider, id: ' ' })).toThrow(PaygateError)
  })

  test('without a provider — or without the providers service at all — find answers null and get throws UnknownPaygate', async () => {
    const empty = await makeFakeContext({ providers: [] })
    expect(paymentAccessOf(empty.ctx).paygates().find('fake')).toBeNull()
    expect(() => paygatesOf(empty.ctx).get('fake')).toThrow(UnknownPaygate)
    expect(empty.ctx.hasService(PAYMENT_PROVIDERS)).toBe(true)

    const bare = makePaygateRegistry({ hasService: () => false } as never)
    expect(bare.all()).toEqual([])
    expect(() => bare.get('fake')).toThrow(UnknownPaygate)
  })

  test('forSale: absent gateways sell through every paygate, declared ones through those only, a recurring plan needs subscriptions', async () => {
    const full = makeFakePaygate({ id: 'full' })
    const once = makeFakePaygate({ id: 'once', without: ['subscriptions'] })
    const fake = await makeFakeContext({
      providers: [full.provider, once.provider],
      catalogue: {
        plans: [{
          productSku: CREDITS_PRODUCT, sku: 'once-only', duration: PlanDuration.Consumable, price: 0.02, gateways: ['once'],
          pricingMode: CheckoutPricingMode.Amount,
          amountPolicy: { currency: 'usd', minimumMinor: 500, maximumMinor: 5_000, defaultMinor: 1_000, presetsMinor: [1_000], fixedMinor: 0, rateBps: 0 },
        }],
      },
    })
    const registry = paygatesOf(fake.ctx)
    const ids = (paygates: Array<{ id: string }>) => paygates.map(paygate => paygate.id)

    const pro = await planOf(fake.ctx, PRO)
    const credits = await planOf(fake.ctx, CREDIT_UNIT)
    const onceOnly = await planOf(fake.ctx, 'once-only')
    const free = await planOf(fake.ctx, FREE)

    expect(ids(registry.forSale(pro.product, pro.plan))).toEqual(['full'])
    expect(ids(registry.forSale(credits.product, credits.plan))).toEqual(['full', 'once'])
    expect(ids(registry.forSale(credits.product, credits.plan, 'once'))).toEqual(['once'])
    expect(ids(registry.forSale(onceOnly.product, onceOnly.plan))).toEqual(['once'])
    expect(ids(registry.forSale(free.product, free.plan))).toEqual([])
    expect(pro.product.gateways).toBeUndefined()
    expect(pro.product.sku).toBe(PLANS_PRODUCT)
  })

  test('boot: a declared policy feature a registered paygate lacks fails the gateway initialization', async () => {
    const untaxed = makeFakePaygate({ features: { automaticTax: false } })
    await expect(makeFakeContext({ providers: [untaxed.provider] })).rejects.toThrow('paygate:feature:automaticTax:fake')

    const local = makeFakePaygate({ features: { adaptiveCurrency: false } })
    await expect(makeFakeContext({
      providers: [local.provider],
      pricing: { tax: { automatic: true, collectTaxId: true, estimate: false }, currency: { adaptive: true, estimate: false } },
    })).rejects.toThrow('paygate:feature:adaptiveCurrency:fake')

    const plain = makeFakePaygate({ features: { termsConsent: false } })
    await expect(makeFakeContext({
      providers: [plain.provider],
      consumerRights: {
        textVersion: 'terms-v1', links: { en: { billingTerms: 'https://legal.example.com/terms' } },
        mechanisms: { checkoutTerms: true }, trader: { name: 'Example', legalName: 'Example Ltd' },
      },
    })).rejects.toThrow('paygate:feature:termsConsent:fake')

    expect(await makeFakeContext({ providers: [local.provider] })).toBeDefined()
  })

  test('boot: a managed, bootstrapping gateway without any provider fails; without bootstrap it only warns', async () => {
    await expect(makeFakeContext({ providers: [], gateway: { manage: true } })).rejects.toThrow('paygate:provider:none')
    expect(await makeFakeContext({ providers: [], gateway: { manage: true, bootstrap: false } })).toBeDefined()
    expect(await makeFakeContext({ providers: [], gateway: { manage: false } })).toBeDefined()
  })

  test('the bootstrap brings every paygate to the declaration, skipping the capabilities a paygate lacks', async () => {
    const full = makeFakePaygate({ id: 'full' })
    const bare = makeFakePaygate({ id: 'bare', without: ['catalogue', 'portal', 'webhook'] })
    const fake = await makeFakeContext({ providers: [full.provider, bare.provider], gateway: { manage: true, bootstrap: false } })

    await paygateBootstrapOf(fake.ctx).bootstrap({ force: true })

    expect(full.state.calls.map(call => call.method)).toEqual([
      'catalogue.syncProduct', 'catalogue.syncProduct', 'portal.ensureConfiguration', 'webhook.ensureEndpoint',
    ])
    expect(full.state.endpoints).toEqual([{ owner: 'app', webhookUrl: 'https://api.example.com/payment-gate/webhook/full' }])
    expect(full.state.configurations).toEqual([{ owner: 'app', webhookUrl: 'https://api.example.com/payment-gate/webhook/full' }])
    expect(full.state.calls[3].args).toEqual([{ owner: 'app', webhookUrl: 'https://api.example.com/payment-gate/webhook/full' }, { force: true }])
    expect(bare.state.calls).toEqual([])
    expect(fake.stores['payment-fingerprint'].rows.map(row => row.sku).sort()).toEqual([CREDITS_PRODUCT, PLANS_PRODUCT])
  })

  test('a deployment on a local host keeps no webhook endpoint', async () => {
    const local = makeFakePaygate()
    const fake = await makeFakeContext({ providers: [local.provider], host: 'localhost', gateway: { manage: true, bootstrap: false } })

    await paygateBootstrapOf(fake.ctx).bootstrap()

    expect(local.state.calls.map(call => call.method)).not.toContain('webhook.ensureEndpoint')
    expect(local.state.calls.map(call => call.method)).toContain('portal.ensureConfiguration')
  })
})
