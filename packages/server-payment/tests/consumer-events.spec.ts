import { describe, expect, test } from 'bun:test'
import { PurchaseKind, withdrawalDeadlineOf } from '@owlmeans/payment'
import {
  billingProfiles, consumerEvents, fulfillments, paygateCustomers, purchases, subscriptions,
} from '../src/utils.js'
import {
  buyTopUp, ENTITY, invoiceOf, makeRightsContext, paidSession, PRO, requestStart, send,
} from './consumer-fixtures.js'
import { capturePaymentPurchase } from '../src/consumer/capture.js'
import { subscriptionOf } from './fake-stripe.js'
import type { FakeContext } from './fake-stripe.js'

const proSubscription = (startRequestId?: string, overrides: Record<string, unknown> = {}) => {
  const subscription = subscriptionOf({ id: 'sub_pro', customer: 'cus_1', latestInvoice: 'in_sub' }) as unknown as Record<string, any>
  subscription.currency = 'eur'
  subscription.items.data[0].price = { id: 'price_pro', lookup_key: PRO, unit_amount: 1_800, currency: 'eur', tax_behavior: 'exclusive' }
  subscription.items.data[0].quantity = 1
  subscription.metadata = {
    entityId: ENTITY, planSku: PRO, productSku: 'app-plans', service: 'app', country: 'DE', language: 'de',
    ...(startRequestId != null ? { startRequestId } : {}),
  }
  return { ...subscription, ...overrides }
}

const subscriptionSession = (overrides: Record<string, unknown> = {}) => paidSession({
  id: 'cs_sub', mode: 'subscription', subscription: 'sub_pro', invoice: 'in_sub', payment_intent: null,
  amount_subtotal: 1_800, amount_total: 2_142, total_details: { amount_tax: 342 },
  customer_details: { address: { country: 'DE' }, email: 'owner@shop.eu', name: 'Anna', tax_ids: [] },
  metadata: { pricingMode: 'quantity', planSku: PRO, productSku: 'app-plans', country: 'DE', language: 'de' },
  ...overrides,
})

const withSubInvoice = (fake: FakeContext) => {
  fake.state.invoices.in_sub = invoiceOf('in_sub', {
    number: 'INV-SUB-1', subtotal: 1_800, tax: 342, total: 2_142, payment_intent: 'pi_sub',
    lines: { object: 'list', data: [{ id: 'il_sub', amount: 1_800 }] }, customer_address: { country: 'DE' },
  })
}

describe('webhook capture — one-time purchases', () => {
  test('the purchase row exists before the credits are granted, with its window and evidence', async () => {
    const fake = await makeRightsContext()
    const seen: unknown[] = []
    fake.observed.onTopUp = async () => { seen.push(await purchases(fake.ctx).load({ sessionId: 'cs_pl' })) }
    const purchase = await buyTopUp(fake)

    expect(seen[0]).toEqual(expect.objectContaining({ purchaseId: 'stripe:cs_pl' }))
    expect(purchase).toEqual(expect.objectContaining({
      purchaseId: 'stripe:cs_pl', kind: PurchaseKind.TopUp, entityId: ENTITY, country: 'PL', region: 'eu', inScope: true,
      language: 'pl', currency: 'eur', amountSubtotalMinor: 919, amountTaxMinor: 211, amountTotalMinor: 1_130,
      netAmountMinor: 1_000, amountCurrency: 'usd', paymentIntentId: 'pi_pl', invoiceId: 'in_pl',
      invoiceNumber: 'INV-0001', invoiceLineId: 'il_pl', termsAccepted: true, ipCountry: 'PL', email: 'buyer@shop.eu',
      textVersion: 'terms-v1',
    }))
    expect(purchase.contractRef).toMatch(/^CR-\d{6}-[2-9A-HJKMNP-Z]{6}$/)
    expect(purchase.deadline).toEqual(withdrawalDeadlineOf(new Date(purchase.purchasedAt), { marginDays: 5 }))
    expect((await fulfillments(fake.ctx).byExternalId('cs_pl', 'stripe'))).toEqual(expect.objectContaining({
      country: 'PL', email: 'buyer@shop.eu', amountTotalMinor: 1_130, amountTaxMinor: 211, termsAccepted: true,
      purchaseId: 'stripe:cs_pl',
    }))
  })

  test('the first purchase locks the country; a later one elsewhere is only a lock-mismatch event', async () => {
    const fake = await makeRightsContext()
    await buyTopUp(fake)
    expect(await billingProfiles(fake.ctx).byEntity(ENTITY)).toEqual(expect.objectContaining({
      country: 'PL', region: 'eu', currency: 'eur', language: 'pl', source: 'checkout', ipCountry: 'PL',
      email: 'buyer@shop.eu', sessionId: 'cs_pl',
    }))
    const second = await buyTopUp(fake, {
      id: 'cs_de', invoice: 'in_de', customer_details: { address: { country: 'DE' }, email: 'buyer@shop.eu' },
      metadata: { ipCountry: 'AT' },
    })
    expect(second.country).toBe('DE')
    expect((await billingProfiles(fake.ctx).byEntity(ENTITY))?.country).toBe('PL')
    const mismatch = (await consumerEvents(fake.ctx).list({ action: 'lock-mismatch' })).items
    expect(mismatch).toHaveLength(1)
    expect(JSON.parse(mismatch[0].detail ?? '{}')).toEqual(expect.objectContaining({ locked: 'PL', observed: 'DE', sessionId: 'cs_de' }))
  })

  test('the confirmation is mailed once, in the billing language, with the withdrawal information and an archive copy', async () => {
    const fake = await makeRightsContext()
    await buyTopUp(fake, { customer_details: { address: { country: 'PL' }, email: 'buyer@shop.eu', name: 'Jan <b>K</b>' } })
    await send(fake, 'checkout.session.completed', paidSession())
    const mails = fake.mails.filter(mail => mail.subject.includes('CR-'))
    expect(mails.map(mail => mail.to)).toEqual(['buyer@shop.eu', 'archive@example.com'])
    const [mail] = mails
    expect(mail.from).toBe('billing@example.com')
    expect(mail.text).toContain('Example Trading Ltd, 1 Example Street, 00-001 Example, support@example.com')
    expect(mail.text).toContain('https://app.example.com/legal/withdraw')
    expect(mail.text).toContain('Odstąp od umowy tutaj')
    expect(mail.html).toContain('Jan &lt;b&gt;K&lt;/b&gt;')
    expect(mail.html).not.toContain('<b>K</b>')
  })

  test('concurrent deliveries in several processes mail the confirmation once', async () => {
    const fake = await makeRightsContext()
    fake.state.invoices.in_pl = invoiceOf()
    const session = paidSession() as never
    // Not through the webhook handler, whose per-customer lock serializes one process: two processes race here.
    await Promise.all([
      capturePaymentPurchase(fake.ctx, fake.stripe, session), capturePaymentPurchase(fake.ctx, fake.stripe, session),
    ])
    await send(fake, 'checkout.session.completed', paidSession())
    expect(fake.mails.filter(mail => mail.subject.includes('CR-')).map(mail => mail.to)).toEqual(['buyer@shop.eu', 'archive@example.com'])
    expect(await consumerEvents(fake.ctx).count({ action: 'mail', step: 'purchase' })).toBe(1)
    expect((await purchases(fake.ctx).load({ sessionId: 'cs_pl' }))?.confirmationMailAt).toBeInstanceOf(Date)
  })

  test('a checkout that collected no terms records no acceptance', async () => {
    const fake = await makeRightsContext()
    const purchase = await buyTopUp(fake, { consent: null, metadata: { termsCollected: 'false' } })
    expect(purchase.termsAccepted).toBeUndefined()
    expect((await fulfillments(fake.ctx).byExternalId('cs_pl', 'stripe'))?.termsAccepted).toBeUndefined()
  })

  test('a purchase outside the territories has no window and no confirmation', async () => {
    const fake = await makeRightsContext()
    const purchase = await buyTopUp(fake, {
      id: 'cs_us', invoice: 'in_us', currency: 'usd', amount_subtotal: 1_021, amount_total: 1_021, total_details: { amount_tax: 0 },
      customer_details: { address: { country: 'US' }, email: 'buyer@shop.us' },
      metadata: { country: 'US', currency: 'usd', chargeAmountMinor: '1021', language: 'en' },
    })
    expect(purchase).toEqual(expect.objectContaining({ inScope: false, region: 'other', country: 'US' }))
    expect(purchase.deadline).toBeUndefined()
    expect(fake.mails).toHaveLength(0)
    expect((await billingProfiles(fake.ctx).byEntity(ENTITY))?.currency).toBe('usd')
  })

  test('customer webhooks store the paygate country and currency', async () => {
    const fake = await makeRightsContext()
    await send(fake, 'customer.updated', { id: 'cus_9', email: 'a@shop.eu', address: { country: 'fr' }, currency: 'EUR', metadata: { entityId: ENTITY } })
    expect(await paygateCustomers(fake.ctx).loadByPgId('cus_9', 'stripe')).toEqual(expect.objectContaining({ country: 'FR', currency: 'eur' }))
  })
})

describe('webhook capture — subscriptions', () => {
  test('the first commit writes the purchase before the created observers; the checkout refines it', async () => {
    const fake = await makeRightsContext()
    withSubInvoice(fake)
    const startRequestId = await requestStart(fake)
    const seen: unknown[] = []
    fake.observed.onSubscription = async event => {
      if (event.change === 'created') seen.push(await purchases(fake.ctx).byPurchaseId('stripe:sub_pro'))
    }
    const subscription = proSubscription(startRequestId)
    fake.state.subscriptions.sub_pro = subscription as never
    await send(fake, 'customer.subscription.created', subscription)

    expect(seen[0]).toEqual(expect.objectContaining({
      purchaseId: 'stripe:sub_pro', kind: PurchaseKind.Subscription, subscriptionId: 'sub_pro', invoiceId: 'in_sub',
      invoiceNumber: 'INV-SUB-1', invoiceLineId: 'il_sub', paymentIntentId: 'pi_sub', currency: 'eur',
      amountSubtotalMinor: 1_800, amountTaxMinor: 342, amountTotalMinor: 2_142, startRequestId, consentId: startRequestId,
      country: 'DE', inScope: true,
    }))
    const stored = seen[0] as { servicesStartedAt: Date, consentedAt: Date }
    expect(stored.servicesStartedAt).toBeInstanceOf(Date)
    expect(stored.consentedAt).toEqual(stored.servicesStartedAt)

    await send(fake, 'checkout.session.completed', subscriptionSession({ customer_details: { address: { country: 'AT' }, email: 'owner@shop.eu', name: 'Anna' } }))
    expect(await purchases(fake.ctx).byPurchaseId('stripe:sub_pro')).toEqual(expect.objectContaining({
      sessionId: 'cs_sub', country: 'AT', email: 'owner@shop.eu', termsAccepted: true, amountTotalMinor: 2_142,
    }))
    expect(await subscriptions(fake.ctx).byExternalId('sub_pro', 'stripe')).toEqual(expect.objectContaining({
      checkoutSessionId: 'cs_sub', purchaseId: 'stripe:sub_pro', firstInvoiceId: 'in_sub', currency: 'eur', country: 'AT',
      email: 'owner@shop.eu', amountTotalMinor: 2_142, amountTaxMinor: 342, termsAccepted: true, startRequestId,
    }))
    expect((await billingProfiles(fake.ctx).byEntity(ENTITY))?.country).toBe('AT')
    const confirmation = fake.mails.find(mail => mail.to === 'owner@shop.eu' && mail.subject.includes('CR-'))
    // The order confirmation is in the billing language; the start request is repeated verbatim, as shown (en).
    expect(confirmation?.subject).toStartWith('Bestellbestätigung')
    expect(confirmation?.text).toContain('I expressly request and agree that Example starts the Pro platform services')
    expect(confirmation?.text).toContain('https://app.example.com/legal/cancel')
  })

  test('a completed subscription checkout that arrives first applies the subscription itself', async () => {
    const fake = await makeRightsContext()
    withSubInvoice(fake)
    fake.state.subscriptions.sub_pro = proSubscription() as never
    await send(fake, 'checkout.session.completed', subscriptionSession())
    expect(fake.observed.subscription.map(event => event.change)).toEqual(['created'])
    expect(await purchases(fake.ctx).byPurchaseId('stripe:sub_pro')).toEqual(expect.objectContaining({ sessionId: 'cs_sub', country: 'DE' }))
    // Renewals are not purchases.
    await send(fake, 'invoice.paid', { id: 'in_renew', object: 'invoice', subscription: 'sub_pro', customer: 'cus_1', billing_reason: 'subscription_cycle' })
    expect(fake.stores['payment-purchase'].rows).toHaveLength(1)
  })
})

describe('webhook capture — refunds', () => {
  const charge = { id: 'ch_pl', amount: 1_130, amount_refunded: 1_130, payment_intent: 'pi_pl', invoice: null }

  test('a withdrawal refund carries its id to the refund observers; a whole refund closes the window', async () => {
    const fake = await makeRightsContext({ stripe: { charges: { ch_pl: charge } } })
    await buyTopUp(fake)
    await send(fake, 'refund.created', {
      id: 're_w', object: 'refund', amount: 1_130, currency: 'eur', status: 'succeeded', payment_intent: 'pi_pl',
      charge: 'ch_pl', metadata: { owlmeans: 'payment', withdrawalId: 'decl_1', purchaseId: 'stripe:cs_pl' },
    })
    expect(fake.observed.refund[0]).toEqual(expect.objectContaining({
      withdrawalId: 'decl_1', metadata: expect.objectContaining({ withdrawalId: 'decl_1' }), partial: false,
    }))
    const purchase = await purchases(fake.ctx).byPurchaseId('stripe:cs_pl')
    expect(purchase?.refundedMinor).toBe(1_130)
    expect(purchase?.refundedAt).toBeInstanceOf(Date)
  })

  test('an ordinary partial refund carries no withdrawal id and keeps the window open', async () => {
    const fake = await makeRightsContext({ stripe: { charges: { ch_pl: { ...charge, amount_refunded: 300 } } } })
    await buyTopUp(fake)
    await send(fake, 'refund.created', {
      id: 're_p', object: 'refund', amount: 300, currency: 'eur', status: 'succeeded', payment_intent: 'pi_pl', charge: 'ch_pl',
    })
    expect(fake.observed.refund[0].withdrawalId).toBeUndefined()
    const purchase = await purchases(fake.ctx).byPurchaseId('stripe:cs_pl')
    expect(purchase?.refundedMinor).toBe(300)
    expect(purchase?.refundedAt).toBeUndefined()
  })
})
