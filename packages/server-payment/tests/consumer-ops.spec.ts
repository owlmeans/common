import { describe, expect, test } from 'bun:test'
import {
  makeCheckoutReadProtocols, makeConsumerRightsProtocols, PerformanceConsentRequired, TaxBehavior,
  WithdrawalStatus,
} from '@owlmeans/payment'
import { checkoutReadEntrypoints, consumerRightsEntrypoints } from '../src/consumer/handlers.js'
import { isReservedAddress } from '../src/consumer/format.js'
import { requestOriginOf } from '../src/consumer/origin.js'
import { estimateStripePrice, makeEstimateCache } from '../src/plugins/estimate.js'
import { ensurePortalConfiguration } from '../src/plugins/portal.js'
import { syncStripeProducts } from '../src/sync.js'
import {
  billingProfiles, consumerEvents, consumerRights, fingerprints, fulfillments, gateway, paygateCustomers, purchases,
} from '../src/utils.js'
import {
  ALL_ON, buyTopUp, CREDITS_PRODUCT, ENTITY, epoch, fixedMeter, makeRightsContext, paidSession, PLANS_PRODUCT, PRO,
  rightsOf, TEXT_VERSION,
} from './consumer-fixtures.js'
import type { FakeContext } from './fake-stripe.js'

const service = (fake: FakeContext) => consumerRights(fake.ctx)
const subject = { entityId: ENTITY, email: 'owner@shop.eu', name: 'Anna' }

/** Run a server binding the way the transport does. */
const invoke = async (entrypoint: any, fake: FakeContext, req: Record<string, unknown>): Promise<any> => {
  fake.ctx.registerEntrypoint(entrypoint)
  const res: any = { resolve: (value: unknown) => { res.value = value }, reject: (error: Error) => { res.error = error } }
  await entrypoint.handle({ headers: {}, query: {}, params: {}, path: '/', alias: entrypoint.alias, ...req }, res)
  if (res.error != null) throw res.error
  return res.value
}

describe('reconcile', () => {
  test('a failed mail is sent again; a sent one never twice', async () => {
    const fake = await makeRightsContext()
    const send = fake.mailer.send
    fake.mailer.send = async () => { throw new Error('smtp down') }
    const purchase = await buyTopUp(fake)
    fake.mailer.send = send
    const failed = await consumerEvents(fake.ctx).load({ recordId: purchase.purchaseId, action: 'mail' })
    expect(failed).toEqual(expect.objectContaining({ ok: false, step: 'purchase', error: 'smtp down' }))

    expect((await service(fake).reconcile()).mailed).toBe(1)
    expect(fake.mails.filter(mail => mail.to === 'buyer@shop.eu')).toHaveLength(1)
    expect((await service(fake).reconcile()).mailed).toBe(0)
  })

  test('the application renderer may replace a mail or suppress it (recorded as skipped)', async () => {
    const fake = await makeRightsContext()
    const kinds: string[] = []
    service(fake).useMailRenderer((kind, data, rendered) => {
      kinds.push(kind)
      if (kind === 'purchase') return { ...rendered, subject: `[Shop] ${rendered.subject}`, to: data.to }
      return null
    })
    const purchase = await buyTopUp(fake)
    expect(fake.mails.find(mail => mail.to === 'buyer@shop.eu')?.subject).toStartWith('[Shop] ')
    await service(fake).recordConsent(subject, {
      purchaseIds: [purchase.purchaseId], textVersion: TEXT_VERSION, language: 'en', acknowledged: true,
    })
    expect(kinds).toEqual(['purchase', 'consent'])
    expect(fake.mails.some(mail => mail.to === 'owner@shop.eu')).toBe(false)
    const skipped = (await consumerEvents(fake.ctx).list({ action: 'mail', step: 'consent' })).items[0]
    expect(skipped).toEqual(expect.objectContaining({ ok: true, skipped: true, detail: '{"reason":"renderer"}' }))
  })

  test('a throwing withdrawal observer is recorded and told again by reconcile, once', async () => {
    const fake = await makeRightsContext({ meter: fixedMeter({ granted: 1_000, used: 0, usedAfter: 0 }) })
    const purchase = await buyTopUp(fake)
    fake.observed.failWithdrawal = 1
    const receipt = await service(fake).withdraw(subject, { purchaseId: purchase.purchaseId, name: 'Anna', email: 'owner@shop.eu' })
    expect(receipt.status).toBe(WithdrawalStatus.Refunded)
    expect(fake.observed.withdrawal).toHaveLength(0)
    expect((await service(fake).reconcile()).observed).toBe(1)
    expect(fake.observed.withdrawal).toEqual([expect.objectContaining({
      withdrawalId: receipt.declarationId, status: WithdrawalStatus.Refunded, units: { granted: 1_000, used: 0, returned: 1_000 },
    })])
    await service(fake).reconcile()
    expect(fake.observed.withdrawal).toHaveLength(1)
  })

  test('completed checkouts of the last 16 days without a purchase are backfilled, without mail', async () => {
    const fake = await makeRightsContext()
    const created = epoch(new Date(Date.now() - 3 * 86_400_000))
    fake.state.listedSessions = [
      paidSession({ id: 'cs_missed', created, invoice: null }),
      paidSession({ id: 'cs_old', created: epoch(new Date(Date.now() - 40 * 86_400_000)), invoice: null }),
    ]
    const result = await service(fake).reconcile()
    expect(result.backfilled).toBe(1)
    const purchase = await purchases(fake.ctx).load({ sessionId: 'cs_missed' })
    expect(purchase).toEqual(expect.objectContaining({ purchasedAt: new Date(created * 1000), inScope: true }))
    expect(fake.mails).toHaveLength(0)
    expect((await billingProfiles(fake.ctx).byEntity(ENTITY))?.country).toBe('PL')
  })

  test('an organization that paid before the lock is locked from its paygate customer', async () => {
    const fake = await makeRightsContext()
    await paygateCustomers(fake.ctx).create({ paygate: 'stripe', externalId: 'cus_n', entityId: 'entity-n', country: 'NO' })
    await fulfillments(fake.ctx).create({
      entityId: 'entity-n', productSku: CREDITS_PRODUCT, service: 'app', paygate: 'stripe', externalId: 'cs_n',
      mode: 'amount' as never, createdAt: new Date(), fulfilledAt: new Date(),
    })
    await paygateCustomers(fake.ctx).create({ paygate: 'stripe', externalId: 'cus_u', entityId: 'entity-u', country: 'US' })
    expect((await service(fake).reconcile()).locked).toBe(1)
    expect(await billingProfiles(fake.ctx).byEntity('entity-n')).toEqual(expect.objectContaining({
      country: 'NO', source: 'customer', region: 'eu',
    }))
    expect(await billingProfiles(fake.ctx).byEntity('entity-u')).toBeNull()
  })
})

describe('handlers', () => {
  const account = { base: { alias: 'app:account', path: '/account' } }
  const protocols = makeConsumerRightsProtocols({ prefix: 'app:consumer', guards: ['guard:default'], public: {} })
  const req = (extra: Record<string, unknown> = {}) => ({ entity: { id: ENTITY }, ...extra })

  test('a public subtree needs a throttle; the account and public routes are all bound', () => {
    expect(() => consumerRightsEntrypoints(protocols)).toThrow(SyntaxError)
    expect(consumerRightsEntrypoints(protocols, { throttle: async () => undefined })).toHaveLength(14)
    const accountOnly = makeConsumerRightsProtocols({ prefix: 'app:consumer2', guards: ['guard:default'] })
    expect(consumerRightsEntrypoints(accountOnly)).toHaveLength(10)
    expect(account.base.alias).toBe('app:account')
  })

  test('the account routes act for the request organization; money-moving acts pass guardMoney first', async () => {
    const fake = await makeRightsContext()
    await buyTopUp(fake)
    const guarded: string[] = []
    const contexts = new Set<unknown>()
    const bound = consumerRightsEntrypoints(protocols, {
      throttle: async () => undefined, publicMinMs: 0,
      resolveEntity: (request, ctx) => { contexts.add(ctx); return request.entity?.id },
      guardMoney: async (_req, action, ctx) => {
        contexts.add(ctx)
        guarded.push(action)
        if (action === 'withdraw') throw new Error('token refused')
      },
      metaOf: (request, ctx) => { contexts.add(ctx); return requestOriginOf(request) },
      subjectOf: () => ({ email: 'owner@shop.eu', name: 'Anna', profileId: 'profile-1' }),
    })
    const byAlias = (alias: string) => bound.find(entry => entry.alias === alias)
    const view = await invoke(byAlias('app:consumer:consent'), fake, req())
    expect(view.required).toBe(true)
    const recorded = await invoke(byAlias('app:consumer:consent:give'), fake, req({
      body: { purchaseIds: view.purchases.map((item: { purchaseId: string }) => item.purchaseId), textVersion: TEXT_VERSION, language: 'pl', acknowledged: true },
      headers: { 'cf-connecting-ip': '203.0.113.9', 'user-agent': 'browser' },
    }))
    expect(recorded.purchaseIds).toHaveLength(1)
    expect(fake.stores['payment-consumer-consent'].rows[0]).toEqual(expect.objectContaining({
      ip: '203.0.113.9', userAgent: 'browser', profileId: 'profile-1',
    }))
    await expect(invoke(byAlias('app:consumer:withdraw'), fake, req({ body: { purchaseId: 'x', name: 'A', email: 'a@shop.eu' } })))
      .rejects.toThrow('token refused')
    expect(guarded).toEqual(['consent', 'withdraw'])
    const profile = await invoke(byAlias('app:consumer:profile'), fake, req())
    expect(profile).toEqual(expect.objectContaining({ country: 'PL', locked: true }))
    await expect(invoke(byAlias('app:consumer:profile'), fake, {})).rejects.toThrow()
    // Every hook is handed the request's context.
    expect([...contexts]).toEqual([fake.ctx])
  })

  test('a start request takes the plan name the application gives, with the context', async () => {
    const fake = await makeRightsContext()
    const named: unknown[] = []
    const bound = consumerRightsEntrypoints(protocols, {
      throttle: async () => undefined,
      planNameOf: (planSku, language, _req, ctx) => { named.push([planSku, language, ctx]); return 'Pro' },
    })
    const started = await invoke(bound.find(entry => entry.alias === 'app:consumer:start:request'), fake, req({
      body: { planSku: PRO, textVersion: TEXT_VERSION, language: 'en', acknowledged: true },
    }))
    expect(started.startRequestId).toBeString()
    expect(named).toEqual([[PRO, 'en', fake.ctx]])
  })

  test('public declarations are throttled, a honeypot records nothing, and the answer takes at least publicMinMs', async () => {
    const fake = await makeRightsContext()
    const throttled: unknown[] = []
    const bound = consumerRightsEntrypoints(protocols, {
      throttle: async (_req, key, ctx) => { throttled.push(key); expect(ctx).toBe(fake.ctx) }, publicMinMs: 150,
    })
    const withdraw = bound.find(entry => entry.alias === 'app:consumer:public:withdraw')
    const started = Date.now()
    const receipt = await invoke(withdraw, fake, {
      body: { contractRef: 'CR-000000-AAAAAA', name: 'Eve', email: 'eve@else.eu' }, headers: { 'x-forwarded-for': '10.0.0.1, 198.51.100.4' },
    })
    expect(Date.now() - started).toBeGreaterThanOrEqual(140)
    expect(Object.keys(receipt).sort()).toEqual(['content', 'declarationId', 'mailed', 'receivedAt'])
    expect(throttled).toEqual([{ action: 'withdrawal', email: 'eve@else.eu', ip: '198.51.100.4' }])
    expect(fake.stores['payment-consumer-declaration'].rows).toHaveLength(1)

    const decoy = await invoke(withdraw, fake, { body: { contractRef: 'CR-1', name: 'Bot', email: 'bot@else.eu', honeypot: 'x' } })
    expect(Object.keys(decoy).sort()).toEqual(['content', 'declarationId', 'mailed', 'receivedAt'])
    expect(fake.stores['payment-consumer-declaration'].rows).toHaveLength(1)

    const policy = await invoke(bound.find(entry => entry.alias === 'app:consumer:public:policy'), fake, {})
    expect(policy).toEqual(expect.objectContaining({ mechanisms: { withdrawal: true, cancellation: true }, textVersion: TEXT_VERSION }))
    expect(policy.languages).toEqual(['en', 'de', 'pl'])
  })

  test('checkout read routes answer the narrowed amount policy and the synced prices', async () => {
    const fake = await makeRightsContext()
    gateway(fake.ctx).use({ alias: 'tier', narrow: async () => ({ maximumMinor: 2_500, reason: 'per-purchase' }) })
    const read = checkoutReadEntrypoints(makeCheckoutReadProtocols({ prefix: 'app:checkout', guards: ['guard:default'] }))
    const policy = await invoke(read.find(entry => entry.alias === 'app:checkout:amount-policy'), fake, req({ query: { productSku: CREDITS_PRODUCT } }))
    expect(policy.limit).toEqual(expect.objectContaining({ maximumMinor: 2_500 }))
    const prices = await invoke(read.find(entry => entry.alias === 'app:checkout:plan-prices'), fake, req({ query: { productSku: PLANS_PRODUCT } }))
    expect(prices).toEqual({ prices: [] })
  })

  test('requestOriginOf: the Cloudflare address first, else the LAST forwarded entry, else x-real-ip, else the socket', () => {
    expect(requestOriginOf({ headers: { 'cf-connecting-ip': '1.1.1.1', 'x-forwarded-for': '9.9.9.9, 2.2.2.2' } } as never).ip).toBe('1.1.1.1')
    const origin = requestOriginOf({
      headers: {
        'x-forwarded-for': '9.9.9.9, 2.2.2.2', 'user-agent': 'x'.repeat(600), 'cf-ipcountry': 'de', 'accept-language': 'de-DE',
      },
    } as never)
    expect(origin).toEqual({
      ip: '2.2.2.2', forwardedFor: '9.9.9.9, 2.2.2.2', userAgent: 'x'.repeat(512), ipCountry: 'DE', acceptLanguage: 'de-DE',
    })
    expect(requestOriginOf({ headers: { 'x-real-ip': '3.3.3.3' } } as never).ip).toBe('3.3.3.3')
    expect(requestOriginOf({ headers: {}, original: { socket: { remoteAddress: '4.4.4.4' } } } as never).ip).toBe('4.4.4.4')
  })
})

describe('sync, portal and estimate under the policy', () => {
  const exclusive = { tax: { automatic: true, collectTaxId: true, estimate: true, behavior: TaxBehavior.Exclusive }, currency: { adaptive: true, estimate: false }, stripe: { settlementCurrency: 'eur' } }

  test('a USD catalogue price syncs as EUR with an exact USD option, each with its tax behavior, persisted', async () => {
    const fake = await makeRightsContext({ pricing: exclusive })
    await syncStripeProducts(fake.ctx, fake.stripe)
    const pro = fake.state.prices.find(price => price.lookup_key === PRO && price.active)
    expect(pro).toEqual(expect.objectContaining({ currency: 'eur', unit_amount: 1_800, tax_behavior: 'exclusive' }))
    expect(pro?.currency_options).toEqual({ usd: { unit_amount: 2_000, tax_behavior: 'exclusive' } })
    const row = await fingerprints(fake.ctx).bySku(PLANS_PRODUCT)
    expect(row?.prices?.find(price => price.planSku === PRO)).toEqual(expect.objectContaining({
      priceId: pro?.id, currency: 'eur', unitAmount: 1_800, options: [{ currency: 'usd', unitAmount: 2_000 }], interval: 'month',
      sourceUnitAmount: 2_000, sourceCurrency: 'usd',
    }))
    expect(await gateway(fake.ctx).planPrices(fake.ctx, PLANS_PRODUCT)).toEqual(expect.arrayContaining([
      { planSku: PRO, currency: 'eur', unitAmountMinor: 1_800, default: true, taxBehavior: TaxBehavior.Exclusive, interval: 'month' },
      { planSku: PRO, currency: 'usd', unitAmountMinor: 2_000, default: false, taxBehavior: TaxBehavior.Exclusive, interval: 'month' },
    ]))

    fake.state.calls.length = 0
    await syncStripeProducts(fake.ctx, fake.stripe)
    expect(fake.state.calls.filter(call => call !== 'rawRequest')).toEqual([])
  })

  test('a changed option replaces the Price, never edits it', async () => {
    const fake = await makeRightsContext({
      pricing: exclusive,
      catalogue: {
        plans: [{
          productSku: PLANS_PRODUCT, sku: 'pro-exact', duration: 'monthly' as never, rank: 15, price: 20, recurring: { interval: 'month' },
          currencyPrices: { usd: 21 },
        }],
      },
    })
    await syncStripeProducts(fake.ctx, fake.stripe)
    const first = fake.state.prices.find(price => price.lookup_key === 'pro-exact' && price.active)
    expect(first?.currency_options).toEqual({ usd: { unit_amount: 2_100, tax_behavior: 'exclusive' } })
    first!.currency_options = { usd: { unit_amount: 1_900, tax_behavior: 'exclusive' } }
    await fingerprints(fake.ctx).clear()
    await syncStripeProducts(fake.ctx, fake.stripe)
    expect(first?.active).toBe(false)
    expect(fake.state.prices.find(price => price.lookup_key === 'pro-exact' && price.active)?.currency_options)
      .toEqual({ usd: { unit_amount: 2_100, tax_behavior: 'exclusive' } })
  })

  test('the portal drops address updates under the country lock', async () => {
    const fake = await makeRightsContext({ portal: { returnUrl: 'https://app.example.com/billing' } })
    await ensurePortalConfiguration(fake.ctx, fake.stripe)
    expect(fake.state.portalConfigurations[0].features.customer_update).toEqual({ enabled: true, allowed_updates: ['email', 'tax_id'] })
    const open = await makeRightsContext({
      portal: { returnUrl: 'https://app.example.com/billing' }, consumerRights: rightsOf({ mechanisms: { ...ALL_ON, countryLock: false } }),
    })
    await ensurePortalConfiguration(open.ctx, open.stripe)
    expect(open.state.portalConfigurations[0].features.customer_update.allowed_updates).toEqual(['email', 'address', 'tax_id'])
  })

  test('a locked profile overrides the requested estimate country; a recurring plan is estimated in the charge currency', async () => {
    const fake = await makeRightsContext({ pricing: exclusive, stripe: { taxRates: { DE: [{ type: 'vat', percentage: '19' }] } } })
    await syncStripeProducts(fake.ctx, fake.stripe)
    await service(fake).lock(ENTITY, 'DE', 'manual')
    const estimate = await estimateStripePrice(fake.ctx, fake.stripe, {
      entityId: ENTITY, productSku: PLANS_PRODUCT, planSku: PRO, country: 'US',
    }, makeEstimateCache())
    expect(estimate).toEqual(expect.objectContaining({ country: 'DE', source: 'profile', locked: true, region: 'eu', currency: 'eur' }))
    expect(estimate.tax).toEqual(expect.objectContaining({ subtotalMinor: 1_800, taxMinor: 342, totalMinor: 2_142 }))

    const other = await makeRightsContext({ pricing: exclusive })
    await syncStripeProducts(other.ctx, other.stripe)
    const usd = await estimateStripePrice(other.ctx, other.stripe, {
      entityId: 'entity-us', productSku: PLANS_PRODUCT, planSku: PRO, country: 'US',
    }, makeEstimateCache())
    expect(usd).toEqual(expect.objectContaining({ country: 'US', source: 'request', region: 'other', currency: 'usd' }))
    expect(usd.tax.subtotalMinor).toBe(2_000)
    expect(usd.locked).toBeUndefined()
  })
})

describe('the declaration', () => {
  test('a mechanism without a trader, or a malformed archive address, is refused', async () => {
    const { declareConsumerRights } = await import('../src/config.js')
    const cfg = { records: [] } as never
    expect(() => declareConsumerRights(cfg, rightsOf({ trader: undefined }))).toThrow('policy:trader')
    expect(() => declareConsumerRights(cfg, rightsOf({ mail: { bcc: ['not-an-address'] } }))).toThrow('policy:mail-bcc')
    const policy = declareConsumerRights(cfg, rightsOf())
    expect(policy).not.toHaveProperty('trader')
    expect(policy).not.toHaveProperty('mail')
    expect(policy.deadline).toEqual({ weekendRollover: true, marginDays: 5 })
  })

  test('plan withdrawal components must add up to the price', async () => {
    const { declarePaymentPlan } = await import('../src/config.js')
    const plan = {
      productSku: PLANS_PRODUCT, sku: 'split-plan', duration: 'monthly' as never, price: 20, recurring: { interval: 'month' as const },
    }
    expect(() => declarePaymentPlan({ records: [] } as never, {
      ...plan, withdrawal: { components: [{ key: 'services', basis: 'time', shareMinor: 1_000 }] },
    })).toThrow('withdrawal:split-plan:shares')
    expect(() => declarePaymentPlan({ records: [] } as never, { ...plan, currencyPrices: { usd: 0 } })).toThrow('currency-prices')
    const cfg = { records: [] } as { records: Array<Record<string, unknown>> }
    declarePaymentPlan(cfg as never, {
      ...plan, currencyPrices: { USD: 20 },
      withdrawal: { components: [{ key: 'services', basis: 'time', shareMinor: 1_000 }, { key: 'credits', basis: 'units', shareMinor: 1_000 }] },
    })
    expect(cfg.records[0]).toEqual(expect.objectContaining({ currencyPrices: { usd: 20 } }))
  })

  test('reserved mail domains: .test, .example, .invalid, .localhost and every subdomain of them', () => {
    for (const address of [
      'a@shop.test', 'a@mail.shop.test', 'A@Shop.EXAMPLE', 'a@x.invalid', 'a@localhost', 'a@app.localhost',
      ' Jan <a@shop.test> ', 'a@shop.test.',
    ]) {
      expect([address, isReservedAddress(address)]).toEqual([address, true])
    }
    for (const address of ['a@shop.eu', 'a@test.com', 'a@example.com', 'a@testing', 'a@localhost.com', 'a@test.example.org']) {
      expect([address, isReservedAddress(address)]).toEqual([address, false])
    }
  })

  test('an unmet consent still refuses after a reconcile — reconcile never consents for anyone', async () => {
    const fake = await makeRightsContext()
    await buyTopUp(fake)
    await service(fake).reconcile()
    await expect(service(fake).assertConsent(ENTITY)).rejects.toBeInstanceOf(PerformanceConsentRequired)
  })
})
