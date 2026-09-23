import { describe, expect, spyOn, test } from 'bun:test'
import Stripe from 'stripe'
import { BillingCountryLocked, SubscriptionStartRequired } from '@owlmeans/payment'
import { createCheckoutLink, isMissingTermsUrl } from '../src/plugins/stripe.js'
import { billingProfiles, consumerConsents, consumerEvents, consumerRights, fulfillments } from '../src/utils.js'
import type { CheckoutPlugin } from '../src/types.js'
import {
  ALL_ON, CREDITS_PRODUCT, ENTITY, makeRightsContext, PLANS_PRODUCT, PRO, requestStart, rightsOf,
} from './consumer-fixtures.js'
import { TEAM } from './fake-stripe.js'
import type { FakeContext } from './fake-stripe.js'

const successUrl = 'https://app.example.com/ok'
const topUp = (fake: FakeContext, extra: Record<string, unknown> = {}, plugins: CheckoutPlugin[] = []) => createCheckoutLink(fake.ctx, fake.stripe, {
  productSku: CREDITS_PRODUCT, entityId: ENTITY, service: 'app', amountMinor: 1_000, successUrl, ...extra,
}, plugins)

/** What Stripe (SDK 17) answers a terms checkbox on an account without a Dashboard terms URL. */
const TERMS_URL_MESSAGE = 'You cannot collect consent to your terms of service unless a URL is set in the Stripe '
  + 'Dashboard. Update your public business details at https://dashboard.stripe.com/settings/public to set the URL '
  + 'for your terms of service.'
const missingTermsUrl = () => new Stripe.errors.StripeInvalidRequestError({
  type: 'invalid_request_error', message: TERMS_URL_MESSAGE, param: 'consent_collection[terms_of_service]', statusCode: 400,
})
const subscribe = (fake: FakeContext, extra: Record<string, unknown> = {}) => createCheckoutLink(fake.ctx, fake.stripe, {
  productSku: PLANS_PRODUCT, planSku: PRO, entityId: ENTITY, service: 'app', successUrl, ...extra,
})
const session = (fake: FakeContext, index = 0) => fake.state.checkoutSessions[index]

/** The pro plan synced as EUR 18.00 with an exact USD 20.00 option. */
const PRO_PRICE = {
  id: 'price_pro', product: PLANS_PRODUCT, lookup_key: PRO, active: true, recurring: { interval: 'month' },
  currency: 'eur', unit_amount: 1_800, tax_behavior: 'exclusive',
  currency_options: { eur: { unit_amount: 1_800 }, usd: { unit_amount: 2_000, tax_behavior: 'exclusive' } },
}
const TEAM_PRICE = {
  id: 'price_team', product: PLANS_PRODUCT, lookup_key: TEAM, active: true, recurring: { interval: 'month' },
  currency: 'eur', unit_amount: 4_500,
}

const lockTo = async (fake: FakeContext, country: string, customerCountry?: string) => {
  await consumerRights(fake.ctx).lock(ENTITY, country, 'manual')
  if (customerCountry !== undefined) {
    fake.state.customers.cus_locked = { id: 'cus_locked', object: 'customer', address: customerCountry == null ? null : { country: customerCountry } }
    const { paygateCustomers } = await import('../src/utils.js')
    await paygateCustomers(fake.ctx).create({ paygate: 'stripe', externalId: 'cus_locked', entityId: ENTITY })
  }
}

describe('checkout under a consumer-rights policy — currency', () => {
  test('an EU buyer is charged in EUR through the FX reference rate, with Adaptive Pricing', async () => {
    const fake = await makeRightsContext()
    await topUp(fake, { country: 'pl', ipCountry: 'pl' })
    expect(session(fake).line_items[0].price_data).toEqual(expect.objectContaining({ currency: 'eur', unit_amount: 919 }))
    expect(fake.state.rawRequests).toHaveLength(1)
    expect(session(fake).adaptive_pricing).toEqual({ enabled: true })
    expect(session(fake).metadata).toEqual(expect.objectContaining({
      currency: 'eur', chargeAmountMinor: '919', amountCurrency: 'usd', amountMinor: '1000', region: 'eu', country: 'PL',
      language: 'pl', termsVersion: 'terms-v1', ipCountry: 'PL',
    }))
    expect(session(fake).metadata.copyVersion).toBeString()
    // The declared country is preselected on the new customer's address, never over a saved one.
    const customer = Object.values(fake.state.customers)[0]
    expect(customer.address).toEqual({ country: 'PL' })
  })

  test('a buyer outside the territories is charged exact USD — no FX call, no Adaptive Pricing', async () => {
    const fake = await makeRightsContext()
    await topUp(fake, { country: 'US' })
    expect(session(fake).line_items[0].price_data).toEqual(expect.objectContaining({ currency: 'usd', unit_amount: 1_021 }))
    expect(fake.state.rawRequests).toHaveLength(0)
    expect(session(fake).adaptive_pricing).toBeUndefined()
    expect(session(fake).metadata).toEqual(expect.objectContaining({ currency: 'usd', chargeAmountMinor: '1021', region: 'other' }))
    // No legal submit text for a buyer without the rights.
    expect(session(fake).custom_text).toBeUndefined()
  })

  test('an in-scope top-up says what it is, in the billing language', async () => {
    const fake = await makeRightsContext()
    await topUp(fake, { country: 'DE' })
    expect(session(fake).custom_text.submit.message).toContain('Deutschland')
    expect(session(fake).custom_text.submit.message).toContain('14')
  })

  test('without a consumer-rights policy the legacy settlement behaviour is unchanged', async () => {
    const fake = await makeRightsContext({ consumerRights: undefined })
    await topUp(fake, { country: 'US' })
    expect(session(fake).line_items[0].price_data).toEqual(expect.objectContaining({ currency: 'eur', unit_amount: 919 }))
    expect(session(fake).metadata.region).toBeUndefined()
  })
})

describe('checkout under a consumer-rights policy — the country lock', () => {
  test('a locked country overrides the request; another declared country is refused', async () => {
    const fake = await makeRightsContext()
    await lockTo(fake, 'DE')
    await expect(topUp(fake, { country: 'PL' })).rejects.toBeInstanceOf(BillingCountryLocked)
    await topUp(fake)
    expect(session(fake).metadata).toEqual(expect.objectContaining({ country: 'DE', currency: 'eur', language: 'de' }))
  })

  test('a locked customer keeps its saved address: address never, collection auto, name still auto', async () => {
    const fake = await makeRightsContext()
    await lockTo(fake, 'DE', 'DE')
    await topUp(fake)
    expect(session(fake).customer_update).toEqual({ address: 'never', name: 'auto' })
    expect(session(fake).billing_address_collection).toBe('auto')
  })

  test('a locked customer without a saved address still lets Checkout collect one', async () => {
    const fake = await makeRightsContext()
    await lockTo(fake, 'DE', null as unknown as string)
    await topUp(fake)
    expect(session(fake).customer_update).toEqual({ address: 'auto', name: 'auto' })
    expect(session(fake).billing_address_collection).toBe('required')
  })

  test('a saved customer address that left the locked country is refused', async () => {
    const fake = await makeRightsContext()
    await lockTo(fake, 'DE', 'FR')
    const refusal = await topUp(fake).catch(error => error)
    expect(refusal).toBeInstanceOf(BillingCountryLocked)
    expect(refusal).toEqual(expect.objectContaining({ country: 'DE', requested: 'FR' }))
  })

  test('an organization that paid before the lock is locked lazily from its customer address', async () => {
    const fake = await makeRightsContext()
    const { paygateCustomers } = await import('../src/utils.js')
    fake.state.customers.cus_old = { id: 'cus_old', object: 'customer', address: { country: 'US' } }
    await paygateCustomers(fake.ctx).create({ paygate: 'stripe', externalId: 'cus_old', entityId: ENTITY })
    await fulfillments(fake.ctx).create({
      entityId: ENTITY, productSku: CREDITS_PRODUCT, service: 'app', paygate: 'stripe', externalId: 'cs_old',
      mode: 'amount' as never, createdAt: new Date(), fulfilledAt: new Date(),
    })
    await topUp(fake)
    expect(await billingProfiles(fake.ctx).byEntity(ENTITY)).toEqual(expect.objectContaining({
      country: 'US', source: 'customer', currency: 'usd',
    }))
    expect(session(fake).metadata.currency).toBe('usd')
    await expect(topUp(fake, { country: 'PL' })).rejects.toBeInstanceOf(BillingCountryLocked)
    expect((await consumerEvents(fake.ctx).list({ action: 'lock' })).items).toHaveLength(1)
  })
})

describe('checkout under a consumer-rights policy — terms', () => {
  test('the terms checkbox is off until the policy turns it on', async () => {
    const fake = await makeRightsContext()
    await topUp(fake, { country: 'PL' })
    expect(session(fake).consent_collection).toBeUndefined()
    expect(session(fake).custom_text?.terms_of_service_acceptance).toBeUndefined()
  })

  test('on, every checkout requires it, with the terms text of the billing language and its links', async () => {
    const fake = await makeRightsContext({ consumerRights: rightsOf({ mechanisms: { ...ALL_ON, checkoutTerms: true } }) })
    await topUp(fake, { country: 'PL' })
    expect(session(fake).consent_collection).toEqual({ terms_of_service: 'required' })
    const text = session(fake).custom_text.terms_of_service_acceptance.message as string
    expect(text).toContain('https://legal.example.com/pl/billing')
    expect(text).toContain('https://legal.example.com/pl/withdrawal')
    expect(text.length).toBeLessThanOrEqual(1200)

    await topUp(fake, { country: 'US' })
    const other = session(fake, 1).custom_text.terms_of_service_acceptance.message as string
    expect(other).toContain('https://legal.example.com/en/billing')
    expect(other).not.toContain('withdrawal')
  })

  test('the session metadata says whether the checkbox was collected', async () => {
    const off = await makeRightsContext()
    await topUp(off, { country: 'PL' })
    expect(session(off).metadata.termsCollected).toBe('false')
    const on = await makeRightsContext({ consumerRights: rightsOf({ mechanisms: { ...ALL_ON, checkoutTerms: true } }) })
    await topUp(on, { country: 'PL' })
    expect(session(on).metadata.termsCollected).toBe('true')
  })

  test('a Dashboard without a terms URL never stops a payment: the session is created again without the checkbox', async () => {
    const fake = await makeRightsContext({ consumerRights: rightsOf({ mechanisms: { ...ALL_ON, checkoutTerms: true } }) })
    const warned = spyOn(console, 'warn')
    try {
      fake.state.failures['checkout.sessions.create'] = missingTermsUrl()
      const url = await topUp(fake, { country: 'PL' })
      expect(url).toStartWith('https://checkout.example.test/')
      expect(fake.state.calls.filter(call => call === 'checkout.sessions.create')).toHaveLength(2)
      expect(session(fake).consent_collection).toBeUndefined()
      expect(session(fake).custom_text.terms_of_service_acceptance).toBeUndefined()
      // The legal submit text stays; only the checkbox and its text go.
      expect(session(fake).custom_text.submit.message).toContain('Polska')
      expect(session(fake).metadata).toEqual(expect.objectContaining({ termsCollected: 'false', termsVersion: 'terms-v1' }))

      const [event] = (await consumerEvents(fake.ctx).list({ action: 'checkout-terms-fallback' })).items
      expect(event).toEqual(expect.objectContaining({
        recordId: ENTITY, recordKind: 'checkout', entityId: ENTITY, ok: false, externalId: expect.stringMatching(/^cs_\d+$/),
      }))
      expect(JSON.parse(event.detail ?? '{}')).toEqual(expect.objectContaining({
        param: 'consent_collection[terms_of_service]', mode: 'amount', productSku: CREDITS_PRODUCT,
        message: expect.stringContaining('terms of service'),
      }))

      // Once per process: a second fallback is audited again, but not warned again.
      fake.state.failures['checkout.sessions.create'] = missingTermsUrl()
      await topUp(fake, { country: 'PL' })
      expect((await consumerEvents(fake.ctx).list({ action: 'checkout-terms-fallback' })).items).toHaveLength(2)
      const operator = warned.mock.calls.filter(args => String(args[0]).includes('terms of service URL'))
      expect(operator).toHaveLength(1)
      expect(String(operator[0][0])).toContain('Settings → Public details')
    } finally {
      warned.mockRestore()
    }
  })

  test('a subscription falls back the same way, its subscription metadata marked too', async () => {
    const fake = await makeRightsContext({
      consumerRights: rightsOf({ mechanisms: { ...ALL_ON, checkoutTerms: true } }), stripe: { prices: [PRO_PRICE] },
    })
    const startRequestId = await requestStart(fake)
    fake.state.failures['checkout.sessions.create'] = missingTermsUrl()
    await subscribe(fake, { startRequestId, country: 'DE' })
    expect(session(fake).consent_collection).toBeUndefined()
    expect(session(fake).custom_text.terms_of_service_acceptance).toBeUndefined()
    expect(session(fake).custom_text.after_submit.message).toContain('https://app.example.com/legal/cancel')
    expect(session(fake).metadata.termsCollected).toBe('false')
    expect(session(fake).subscription_data.metadata).toEqual(expect.objectContaining({ termsCollected: 'false', startRequestId }))
  })

  test('the fallback keeps the admissions; a retry that fails too releases them and says why', async () => {
    const fake = await makeRightsContext({ consumerRights: rightsOf({ mechanisms: { ...ALL_ON, checkoutTerms: true } }) })
    const settled: unknown[] = []
    const hold: CheckoutPlugin = {
      alias: 'hold',
      admit: async () => ({ reservationId: 'hold-1' }),
      settled: async (_ctx, event) => { settled.push(event) },
    }
    fake.state.failures['checkout.sessions.create'] = missingTermsUrl()
    await topUp(fake, { country: 'PL' }, [hold])
    expect(settled).toHaveLength(0)

    fake.state.failures['checkout.sessions.create'] = [missingTermsUrl(), 'rate limited']
    await expect(topUp(fake, { country: 'PL' }, [hold])).rejects.toThrow('rate limited')
    expect(settled).toEqual([expect.objectContaining({ outcome: 'failed', reservationId: 'hold-1' })])
    const failed = (await consumerEvents(fake.ctx).list({ action: 'checkout-terms-fallback' })).items
      .find(event => event.error != null)
    expect(failed).toEqual(expect.objectContaining({ ok: false, error: 'rate limited' }))
    expect(failed?.externalId).toBeUndefined()
  })

  test('any other refusal is not retried', async () => {
    const fake = await makeRightsContext({ consumerRights: rightsOf({ mechanisms: { ...ALL_ON, checkoutTerms: true } }) })
    fake.state.failures['checkout.sessions.create'] = 'Invalid currency: xyz'
    await expect(topUp(fake, { country: 'PL' })).rejects.toThrow('Invalid currency')
    expect(fake.state.calls.filter(call => call === 'checkout.sessions.create')).toHaveLength(1)
    expect((await consumerEvents(fake.ctx).list({ action: 'checkout-terms-fallback' })).items).toHaveLength(0)
  })

  test('only the missing-terms-URL refusal is recognised', () => {
    expect(isMissingTermsUrl(missingTermsUrl())).toBe(true)
    // The message alone (no param), as a plain error carries it.
    expect(isMissingTermsUrl(new Error(TERMS_URL_MESSAGE))).toBe(true)
    // The param with a terms message.
    expect(isMissingTermsUrl({ type: 'StripeInvalidRequestError', param: 'consent_collection[terms_of_service]', message: 'Terms of service consent is not available.' })).toBe(true)
    expect(isMissingTermsUrl(new Stripe.errors.StripeCardError({ type: 'card_error', message: TERMS_URL_MESSAGE }))).toBe(false)
    expect(isMissingTermsUrl({ type: 'StripeInvalidRequestError', param: 'line_items', message: 'Invalid line items' })).toBe(false)
    expect(isMissingTermsUrl({ message: 'Please accept our terms of service' })).toBe(false)
    expect(isMissingTermsUrl(null)).toBe(false)
  })
})

describe('checkout under a consumer-rights policy — subscriptions', () => {
  test('an in-scope (or unknown) buyer needs a fresh start request bound to the plan', async () => {
    const fake = await makeRightsContext({ stripe: { prices: [PRO_PRICE, TEAM_PRICE] } })
    await expect(subscribe(fake)).rejects.toBeInstanceOf(SubscriptionStartRequired)
    await expect(subscribe(fake, { startRequestId: 'nope' })).rejects.toBeInstanceOf(SubscriptionStartRequired)

    const startRequestId = await requestStart(fake)
    await expect(createCheckoutLink(fake.ctx, fake.stripe, {
      productSku: PLANS_PRODUCT, planSku: TEAM, entityId: ENTITY, service: 'app', successUrl, startRequestId,
    })).rejects.toBeInstanceOf(SubscriptionStartRequired)

    await subscribe(fake, { startRequestId, country: 'DE' })
    expect(session(fake).metadata.startRequestId).toBe(startRequestId)
    expect(session(fake).subscription_data.metadata).toEqual(expect.objectContaining({
      startRequestId, entityId: ENTITY, planSku: PRO, country: 'DE', region: 'eu',
    }))
  })

  test('an expired start request, or one of another text version, is asked again', async () => {
    const fake = await makeRightsContext({ stripe: { prices: [PRO_PRICE] } })
    const startRequestId = await requestStart(fake)
    const stored = fake.stores['payment-consumer-consent'].rows.find(row => row.id === startRequestId)!
    stored.expiresAt = new Date(Date.now() - 1_000)
    await expect(subscribe(fake, { startRequestId })).rejects.toBeInstanceOf(SubscriptionStartRequired)

    const fresh = await requestStart(fake)
    fake.stores['payment-consumer-consent'].rows.find(row => row.id === fresh)!.textVersion = 'terms-v0'
    await expect(subscribe(fake, { startRequestId: fresh })).rejects.toBeInstanceOf(SubscriptionStartRequired)
  })

  test('an organization locked outside the territories subscribes without one, in exact USD', async () => {
    const fake = await makeRightsContext({ stripe: { prices: [PRO_PRICE] } })
    await consumerRights(fake.ctx).lock(ENTITY, 'US', 'manual')
    await subscribe(fake)
    expect(session(fake).currency).toBe('usd')
    expect(session(fake).adaptive_pricing).toBeUndefined()
    expect(session(fake).custom_text.submit.message).toContain('$20.00')
  })

  test('an EU subscription is forced to EUR with the renewal text and the cancellation link', async () => {
    const fake = await makeRightsContext({ stripe: { prices: [PRO_PRICE] } })
    const startRequestId = await requestStart(fake)
    await subscribe(fake, { startRequestId, country: 'DE', consumerLanguage: 'en' })
    expect(session(fake).currency).toBe('eur')
    expect(session(fake).adaptive_pricing).toEqual({ enabled: true })
    expect(session(fake).custom_text.submit.message).toContain('€18.00')
    expect(session(fake).custom_text.after_submit.message).toContain('https://app.example.com/legal/cancel')
  })

  test('the application submit text is a function of the charge currency and price', async () => {
    const fake = await makeRightsContext({ stripe: { prices: [PRO_PRICE] } })
    await consumerRights(fake.ctx).lock(ENTITY, 'US', 'manual')
    const seen: unknown[] = []
    await subscribe(fake, {
      submitText: (context: Record<string, unknown>) => { seen.push(context); return `Pay ${String(context.unitAmountMinor)} ${String(context.currency)}` },
    })
    expect(seen[0]).toEqual(expect.objectContaining({ currency: 'usd', unitAmountMinor: 2_000, interval: 'month', region: 'other' }))
    expect(session(fake).custom_text.submit.message).toBe('Pay 2000 usd')
  })

  test('a price that does not carry the charge currency leaves the currency to Stripe', async () => {
    const fake = await makeRightsContext({
      stripe: { prices: [{ ...PRO_PRICE, currency_options: undefined }] },
    })
    await consumerRights(fake.ctx).lock(ENTITY, 'US', 'manual')
    await subscribe(fake)
    expect(session(fake).currency).toBeUndefined()
  })

  test('the start request records the statement it was shown, with the plan name the application passed', async () => {
    const fake = await makeRightsContext({ stripe: { prices: [PRO_PRICE] } })
    const startRequestId = await requestStart(fake, { language: 'de' })
    const record = await consumerConsents(fake.ctx).load(startRequestId)
    expect(record).toEqual(expect.objectContaining({
      kind: 'subscription-start', planSku: PRO, planName: 'Pro', language: 'de', trader: 'Example', ip: '203.0.113.7',
    }))
    expect(record?.text.request).toContain('Ich verlange ausdrücklich')
    expect(record?.text.request).toContain('Pro')
    expect(record?.expiresAt).toBeInstanceOf(Date)
  })
})
