import { ConsentKind } from '@owlmeans/payment'
import { createEventHandler } from '../src/plugins/events.js'
import { consumerRights, purchases } from '../src/utils.js'
import type { ConsumerRightsDef, PricingDef, PurchaseRecord, UsageMeter, UsageQuery, UsageReading } from '../src/types.js'
import { CREDIT_UNIT, CREDITS_PRODUCT, makeFakeContext, PLANS_PRODUCT, PRO } from './fake-stripe.js'
import type { FakeContext, FakeContextOptions } from './fake-stripe.js'

type Rec = Record<string, any>

export const ENTITY = 'entity-1'
export const TEXT_VERSION = 'terms-v1'
export const epoch = (date: Date): number => Math.floor(date.getTime() / 1000)

export const LINKS = {
  en: {
    billingTerms: 'https://legal.example.com/en/billing',
    withdrawalInformation: 'https://legal.example.com/en/withdrawal',
    withdrawalForm: 'https://legal.example.com/en/withdrawal-form',
    withdrawalFunction: 'https://app.example.com/legal/withdraw',
    cancellation: 'https://app.example.com/legal/cancel',
  },
  de: { billingTerms: 'https://legal.example.com/de/billing', withdrawalInformation: 'https://legal.example.com/de/withdrawal' },
  pl: { billingTerms: 'https://legal.example.com/pl/billing', withdrawalInformation: 'https://legal.example.com/pl/withdrawal' },
}

export const ALL_ON = {
  countryLock: true, checkoutTerms: false, performanceConsent: true, subscriptionStart: true, withdrawal: true,
  automaticRefunds: true, cancellation: true, purchaseConfirmation: true,
}

export const TRADER = {
  name: 'Example', legalName: 'Example Trading Ltd', address: '1 Example Street, 00-001 Example',
  email: 'support@example.com',
}

export const rightsOf = (patch: Partial<ConsumerRightsDef> = {}): ConsumerRightsDef => ({
  textVersion: TEXT_VERSION,
  links: LINKS,
  currencies: { eu: 'eur', other: 'usd' },
  mechanisms: ALL_ON,
  trader: TRADER,
  mail: { from: 'billing@example.com', bcc: ['archive@example.com'] },
  ...patch,
})

/** The pricing a EUR-settling account with USD catalogue prices declares. */
export const EUR_SETTLEMENT: PricingDef = {
  tax: { automatic: true, collectTaxId: true, estimate: true },
  currency: { adaptive: true, estimate: false },
  stripe: { settlementCurrency: 'eur' },
}

/** 1 USD = 0.9 EUR at the reference rate. */
export const FX = { usd: { exchangeRate: 0.88, referenceRate: 0.9 } }

export const makeRightsContext = async (opts: FakeContextOptions = {}): Promise<FakeContext> =>
  await makeFakeContext({
    pricing: EUR_SETTLEMENT,
    consumerRights: rightsOf(),
    ...opts,
    stripe: { fxRates: FX, ...opts.stripe },
  })

export interface RecordingMeter extends UsageMeter {
  queries: UsageQuery[]
  reading: Partial<UsageReading> & { granted: number }
}

/** A usage meter answering one fixed reading (mutable through `reading`). */
export const fixedMeter = (reading: Partial<UsageReading> & { granted: number }): RecordingMeter => {
  const meter: RecordingMeter = {
    queries: [],
    reading,
    used: async (_ctx, query) => {
      meter.queries.push(query)
      return { used: 0, usedAfter: 0, ...meter.reading }
    },
  }

  return meter
}

export const send = async (fake: FakeContext, type: string, object: unknown): Promise<void> => {
  await createEventHandler(fake.ctx, fake.stripe).process({ id: `evt_${type}_${Math.random()}`, type, created: epoch(new Date()), data: { object } } as never)
}

/** A completed, paid amount checkout: 10.00 USD of credit charged as 9.19 EUR + 23 % VAT, bought from Poland. */
export const paidSession = (overrides: Rec = {}): Rec => ({
  id: 'cs_pl', object: 'checkout.session', mode: 'payment', payment_status: 'paid', status: 'complete',
  customer: 'cus_1', currency: 'eur', amount_subtotal: 919, amount_total: 1130, total_details: { amount_tax: 211 },
  payment_intent: 'pi_pl', invoice: 'in_pl', created: epoch(new Date()),
  customer_details: {
    address: { country: 'PL' }, email: 'buyer@shop.eu', name: 'Jan Kowalski', tax_ids: [], tax_exempt: 'none',
  },
  consent: { terms_of_service: 'accepted' },
  ...overrides,
  metadata: {
    pricingMode: 'amount', amountMinor: '1000', sourceChargeAmountMinor: '1021', amountCurrency: 'usd',
    chargeAmountMinor: '919', currency: 'eur', entityId: ENTITY, service: 'app', productSku: CREDITS_PRODUCT,
    planSku: CREDIT_UNIT, country: 'PL', language: 'pl', termsVersion: TEXT_VERSION, ipCountry: 'PL',
    ...overrides.metadata,
  },
})

/** The post-payment invoice of `paidSession`. */
export const invoiceOf = (id = 'in_pl', overrides: Rec = {}): Rec => ({
  id, object: 'invoice', number: 'INV-0001', subtotal: 919, tax: 211, total: 1130, currency: 'eur',
  payment_intent: 'pi_pl', lines: { object: 'list', data: [{ id: 'il_pl', amount: 919 }] },
  customer_address: { country: 'PL' }, ...overrides,
})

/** Complete a top-up: the webhook captures the purchase (and locks the country). */
export const buyTopUp = async (fake: FakeContext, overrides: Rec = {}): Promise<PurchaseRecord> => {
  const session = paidSession(overrides)
  fake.state.invoices[session.invoice as string] = fake.state.invoices[session.invoice as string] ?? invoiceOf(session.invoice as string)
  await send(fake, 'checkout.session.completed', session)
  const purchase = await purchases(fake.ctx).load({ sessionId: session.id as string })
  if (purchase == null) throw new Error('no purchase captured')

  return purchase
}

/** A start request of `ENTITY` for the pro plan. */
export const requestStart = async (fake: FakeContext, patch: Rec = {}): Promise<string> =>
  (await consumerRights(fake.ctx).recordStartRequest(
    { entityId: ENTITY, email: 'owner@shop.eu', name: 'Anna' },
    { planSku: PRO, textVersion: TEXT_VERSION, language: 'en', acknowledged: true, ...patch },
    { ip: '203.0.113.7' },
    { plan: 'Pro' },
  )).startRequestId

export { ConsentKind, CREDITS_PRODUCT, CREDIT_UNIT, PLANS_PRODUCT, PRO }
