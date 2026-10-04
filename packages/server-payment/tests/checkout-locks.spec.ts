import { describe, expect, test } from 'bun:test'
import { PaygateError } from '@owlmeans/payment'
import { ensurePortalConfiguration } from '../src/plugins/portal.js'
import { createCheckoutLink, isTaxLocatable } from '../src/plugins/stripe.js'
import { billingProfiles, consumerRights, paygateCustomers } from '../src/utils.js'
import type { PricingDef } from '../src/types.js'
import {
  ALL_ON, buyTopUp, CREDITS_PRODUCT, ENTITY, EUR_SETTLEMENT, makeRightsContext, rightsOf,
} from './consumer-fixtures.js'
import type { FakeContext } from './fake-stripe.js'

const successUrl = 'https://app.example.com/ok'
const topUp = (fake: FakeContext, extra: Record<string, unknown> = {}) => createCheckoutLink(fake.ctx, fake.stripe, {
  productSku: CREDITS_PRODUCT, entityId: ENTITY, service: 'app', amountMinor: 1_000, successUrl, ...extra,
})
const session = (fake: FakeContext) => fake.state.checkoutSessions[0]
const customer = (fake: FakeContext) => Object.values(fake.state.customers)[0]
const locks = (stripe: NonNullable<PricingDef['stripe']>): PricingDef => ({
  ...EUR_SETTLEMENT, stripe: { ...EUR_SETTLEMENT.stripe, ...stripe },
})
const blank = { line1: '', line2: '', city: '', state: '', postal_code: '' }

/** An existing paygate customer of `ENTITY`. */
const seedCustomer = async (fake: FakeContext, fields: Record<string, unknown>) => {
  fake.state.customers.cus_saved = { id: 'cus_saved', object: 'customer', address: null, ...fields }
  await paygateCustomers(fake.ctx).create({ paygate: 'stripe', externalId: 'cus_saved', entityId: ENTITY })
}

describe('checkout — the locked customer e-mail', () => {
  test('without the declaration a passed e-mail is ignored: Checkout asks for one', async () => {
    const fake = await makeRightsContext()
    await topUp(fake, { email: 'owner@example.com' })
    expect(customer(fake).email).toBeUndefined()
  })

  test('a new customer is created with the e-mail, so Checkout shows it read-only', async () => {
    const fake = await makeRightsContext({ pricing: locks({ lockCustomerEmail: true }) })
    await topUp(fake, { email: ' owner@example.com ' })
    expect(customer(fake).email).toBe('owner@example.com')
    expect(session(fake).customer).toBe(customer(fake).id)
    expect(session(fake).customer_email).toBeUndefined()
  })

  test('an existing customer with another e-mail is overwritten in one update; the same one is left alone', async () => {
    const fake = await makeRightsContext({ pricing: locks({ lockCustomerEmail: true }) })
    await seedCustomer(fake, { email: 'typed-at-stripe@example.com', preferred_locales: ['en'] })
    await topUp(fake, { email: 'owner@example.com', locale: 'de' })
    expect(fake.state.customers.cus_saved).toEqual(expect.objectContaining({ email: 'owner@example.com', preferred_locales: ['de'] }))
    expect(fake.state.calls.filter(name => name === 'customers.update')).toHaveLength(1)

    const calls = fake.state.calls.length
    await topUp(fake, { email: 'Owner@Example.com', locale: 'de' })
    expect(fake.state.calls.slice(calls).filter(name => name === 'customers.update')).toHaveLength(0)
  })

  test('under the lock a missing or malformed e-mail is refused before any Stripe call', async () => {
    const fake = await makeRightsContext({ pricing: locks({ lockCustomerEmail: true }) })
    for (const email of [undefined, '', 'not-an-address']) {
      const refusal = await topUp(fake, email != null ? { email } : {}).catch(error => error)
      expect(refusal).toBeInstanceOf(PaygateError)
      expect(refusal.message).toContain('customer-email')
    }
    expect(fake.state.calls).toEqual([])
  })

  test('the portal never offers to edit a locked e-mail', async () => {
    const fake = await makeRightsContext({
      pricing: locks({ lockCustomerEmail: true }), portal: { returnUrl: 'https://app.example.com/billing' },
    })
    await ensurePortalConfiguration(fake.ctx, fake.stripe)
    expect(fake.state.portalConfigurations[0].features.customer_update).toEqual({ enabled: true, allowed_updates: ['tax_id'] })
    const open = await makeRightsContext({
      pricing: locks({ lockCustomerEmail: true }), portal: { returnUrl: 'https://app.example.com/billing' },
      consumerRights: rightsOf({ mechanisms: { ...ALL_ON, countryLock: false } }),
    })
    await ensurePortalConfiguration(open.ctx, open.stripe)
    expect(open.state.portalConfigurations[0].features.customer_update.allowed_updates).toEqual(['address', 'tax_id'])
  })
})

describe('checkout — the pinned country', () => {
  test('the declared country is pinned on a new customer and Checkout keeps it', async () => {
    const fake = await makeRightsContext({ pricing: locks({ lockCustomerCountry: true }) })
    await topUp(fake, { country: 'de' })
    expect(customer(fake).address).toEqual({ country: 'DE', ...blank })
    expect(session(fake).customer_update).toEqual({ address: 'never', name: 'auto' })
    expect(session(fake).billing_address_collection).toBe('auto')
    expect(session(fake).metadata).toEqual(expect.objectContaining({ country: 'DE', countryPinned: 'true' }))
  })

  test('before any lock a saved address of another country is replaced whole', async () => {
    const fake = await makeRightsContext({ pricing: locks({ lockCustomerCountry: true }) })
    await seedCustomer(fake, { address: { country: 'US', postal_code: '97712', line1: '27 Fredrick Ave' } })
    await topUp(fake, { country: 'FR' })
    expect(fake.state.customers.cus_saved.address).toEqual({ country: 'FR', ...blank })
    expect(session(fake).customer_update.address).toBe('never')
  })

  test('a saved address in the declared country is kept as it is', async () => {
    const fake = await makeRightsContext({ pricing: locks({ lockCustomerCountry: true }) })
    await seedCustomer(fake, { address: { country: 'US', postal_code: '97712' } })
    await topUp(fake, { country: 'US' })
    expect(fake.state.customers.cus_saved.address).toEqual({ country: 'US', postal_code: '97712' })
    expect(session(fake).customer_update.address).toBe('never')
    expect(session(fake).metadata.countryPinned).toBe('true')
  })

  test('where Stripe Tax needs more than a country, Checkout still collects the address', async () => {
    const fake = await makeRightsContext({ pricing: locks({ lockCustomerCountry: true }) })
    await topUp(fake, { country: 'US' })
    expect(customer(fake).address).toEqual({ country: 'US', ...blank })
    expect(session(fake).customer_update.address).toBe('auto')
    expect(session(fake).billing_address_collection).toBe('required')
    expect(session(fake).metadata.countryPinned).toBeUndefined()
  })

  test('a locked organization whose customer saved no address gets the locked country pinned', async () => {
    const fake = await makeRightsContext({ pricing: locks({ lockCustomerCountry: true }) })
    await consumerRights(fake.ctx).lock(ENTITY, 'PL', 'manual')
    await seedCustomer(fake, {})
    await topUp(fake)
    expect(fake.state.customers.cus_saved.address).toEqual({ country: 'PL', ...blank })
    expect(session(fake).customer_update.address).toBe('never')
  })

  test('without a known country nothing is pinned', async () => {
    const fake = await makeRightsContext({ pricing: locks({ lockCustomerCountry: true }) })
    await topUp(fake)
    expect(customer(fake).address).toBeNull()
    expect(session(fake).customer_update.address).toBe('auto')
  })

  test('a pinned purchase locks the pinned country, whatever the card form said', async () => {
    const fake = await makeRightsContext({ pricing: locks({ lockCustomerCountry: true }) })
    await buyTopUp(fake, {
      id: 'cs_pinned', customer_details: { address: { country: 'US' }, email: 'buyer@shop.eu' },
      metadata: { country: 'DE', countryPinned: 'true' },
    })
    expect((await billingProfiles(fake.ctx).byEntity(ENTITY))?.country).toBe('DE')
  })

  test('the portal never offers to edit a pinned address, with or without a consumer-rights policy', async () => {
    const fake = await makeRightsContext({
      pricing: locks({ lockCustomerCountry: true }), portal: { returnUrl: 'https://app.example.com/billing' },
      consumerRights: undefined,
    })
    await ensurePortalConfiguration(fake.ctx, fake.stripe)
    expect(fake.state.portalConfigurations[0].features.customer_update.allowed_updates).toEqual(['email', 'tax_id'])
  })

  test('tax-locatable addresses follow Stripe Tax: US needs a postal code, CA and IN a postal code or province', () => {
    expect(isTaxLocatable({ country: 'DE' } as never)).toBe(true)
    expect(isTaxLocatable({ country: 'US' } as never)).toBe(false)
    expect(isTaxLocatable({ country: 'US', state: 'OR' } as never)).toBe(false)
    expect(isTaxLocatable({ country: 'US', postal_code: '97712' } as never)).toBe(true)
    expect(isTaxLocatable({ country: 'CA', state: 'BC' } as never)).toBe(true)
    expect(isTaxLocatable({ country: 'IN', postal_code: '' } as never)).toBe(false)
    expect(isTaxLocatable(null)).toBe(false)
  })
})
