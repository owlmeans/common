import Stripe from 'stripe'
import { config as serverConfig, makeServerContext } from '@owlmeans/server-context'
import type { ServerConfig } from '@owlmeans/server-context'
import { AppType } from '@owlmeans/context'
import {
  CheckoutPricingMode, LimitKind, LimitWindow, PlanDuration, ProductType,
} from '@owlmeans/payment'
import type { PlanCapability } from '@owlmeans/payment'
import { applyQuery, firstMatch, matchCriteria, RecordExists, UnknownRecordError } from '@owlmeans/resource'
import type { Criteria, ListOptions, ResourceRecord } from '@owlmeans/resource'
import type { MongoResource } from '@owlmeans/mongo-resource'
import { makeConsoleMailerService, MAILER_SERVICE } from '@owlmeans/mailer'
import type { MailMessage } from '@owlmeans/mailer'
import type { Context as ApiContext } from '@owlmeans/server-api'
import {
  declareConsumerRights, declarePaymentPlan, declarePaymentPricing, declarePaymentProduct, portalBranding,
  stripeSecrets,
} from '../src/config.js'
import {
  RES_BILLING_PROFILE, RES_CONSUMER_CONSENT, RES_CONSUMER_DECLARATION, RES_CONSUMER_EVENT, RES_PAYGATE_CUSTOMER,
  RES_PAYMENT_FINGERPRINT, RES_PAYMENT_FULFILLMENT, RES_PAYMENT_PURCHASE, RES_PAYMENT_SUBSCRIPTION,
  RES_PAYMENT_USAGE, RES_PAYMENT_USAGE_COUNTER, RES_PAYMENT_WEBHOOK,
} from '../src/consts.js'
import { appendConsumerRights } from '../src/consumer/service.js'
import {
  makeBillingProfileResource, makeConsumerConsentResource, makeConsumerDeclarationResource,
  makeConsumerEventResource, makeFingerprintResource, makeFulfillmentResource, makePaygateCustomerResource,
  makePurchaseResource, makeSubscriptionResource, makeUsageCounterResource, makeUsageResource, makeWebhookResource,
} from '../src/resource.js'
import { appendPaymentGatewayService } from '../src/service.js'
import { observer } from '../src/utils.js'
import type {
  CancellationEvent, Config, ConsentEvent, ConsumerRightsDef, ConsumerRightsOptions, DisputeEvent, PaymentFailedEvent,
  PaymentPlanDef, PortalBrandingDef, PricingDef, RefundEvent, SubscriptionEvent, TopUpCompletion, UsageMeter,
  WithdrawalEvent,
} from '../src/types.js'

// -----------------------------------------------------------------------------------------------
// Catalogue — neutral names only
// -----------------------------------------------------------------------------------------------

export const SERVICE = 'app'
export const HOST = 'api.example.com'
export const PLANS_PRODUCT = 'app-plans'
export const CREDITS_PRODUCT = 'app-credits'
export const FREE = 'free-plan'
export const PRO = 'pro-monthly'
export const TEAM = 'team-monthly'
export const CREDIT_UNIT = 'app-credit-unit'
export const CAP_WHITELABEL = 'feature:whitelabel'
export const CAP_BASIC = 'feature:basic'
export const CAP_PREVIEW = 'feature:preview'

const DAY = 24 * 60 * 60 * 1000
export const future = (days = 30): Date => new Date(Date.now() + days * DAY)
export const past = (days = 30): Date => new Date(Date.now() - days * DAY)

export interface CatalogueOptions {
  /** Declare the free plan (default true). */
  free?: boolean
  /** Until when the `feature:preview` promo of the free plan runs (default: in 30 days). */
  previewUntil?: Date
  /** Until when the `reports` promo of the pro plan runs (default: in 30 days). */
  reportsUntil?: Date
  /** Extra plans. */
  plans?: PaymentPlanDef[]
}

export const declareTestCatalogue = (cfg: Config, opts: CatalogueOptions = {}): void => {
  declarePaymentProduct(cfg, {
    sku: CREDITS_PRODUCT, type: ProductType.Consumable, services: [SERVICE], name: 'Credits',
  })
  declarePaymentPlan(cfg, {
    productSku: CREDITS_PRODUCT, sku: CREDIT_UNIT, duration: PlanDuration.Consumable, price: 0.02,
    pricingMode: CheckoutPricingMode.Amount,
    amountPolicy: {
      currency: 'usd', minimumMinor: 500, maximumMinor: 50_000, defaultMinor: 1_000,
      presetsMinor: [1_000, 2_000, 5_000, 10_000], fixedMinor: 0, rateBps: 200,
    },
  })
  declarePaymentProduct(cfg, {
    sku: PLANS_PRODUCT, type: ProductType.Service, services: [SERVICE], name: 'Plans',
  })
  if (opts.free !== false) {
    declarePaymentPlan(cfg, {
      productSku: PLANS_PRODUCT, sku: FREE, duration: PlanDuration.Monthly, rank: 0, free: true, price: 0,
      capabilities: [
        { scope: 'feature', permissions: { basic: true } },
        { scope: 'feature', permissions: { preview: true }, promo: { until: opts.previewUntil ?? future() } },
      ] satisfies PlanCapability[],
      limits: {
        seats: { kind: LimitKind.Occupancy, limit: 0 },
        exports: { kind: LimitKind.Window, window: LimitWindow.Month, limit: 1 },
        reports: { kind: LimitKind.Lifetime, limit: 1 },
      },
    })
  }
  declarePaymentPlan(cfg, {
    productSku: PLANS_PRODUCT, sku: PRO, duration: PlanDuration.Monthly, rank: 10, price: 20,
    recurring: { interval: 'month' },
    capabilities: [{ scope: 'feature', permissions: { basic: true, whitelabel: true, preview: true } }],
    limits: {
      seats: { kind: LimitKind.Occupancy, limit: 2 },
      exports: { kind: LimitKind.Window, window: LimitWindow.Day, limit: 3 },
      reports: {
        kind: LimitKind.Lifetime, limit: 4, promo: { until: opts.reportsUntil ?? future(), grandfather: true },
      },
    },
  })
  declarePaymentPlan(cfg, {
    productSku: PLANS_PRODUCT, sku: TEAM, duration: PlanDuration.Monthly, rank: 20, price: 50,
    recurring: { interval: 'month' },
    capabilities: [{ scope: 'feature', permissions: { basic: true, whitelabel: true, preview: true } }],
    limits: {
      seats: { kind: LimitKind.Occupancy, limit: 10 },
      exports: { kind: LimitKind.Window, window: LimitWindow.Day, limit: 30 },
      reports: { kind: LimitKind.Lifetime, limit: 40 },
    },
  })
  for (const plan of opts.plans ?? []) {
    declarePaymentPlan(cfg, plan)
  }
}

// -----------------------------------------------------------------------------------------------
// Fake Stripe
// -----------------------------------------------------------------------------------------------

type Rec = Record<string, any>

export type FakeFailure = string | Error

export interface FakeStripeState {
  apiVersion: string
  /** Every SDK method called, in order: `webhookEndpoints.create`, … */
  calls: string[]
  webhookEndpoints: Rec[]
  portalConfigurations: Rec[]
  /** The params every portal session was asked for with. */
  portalSessions: Rec[]
  checkoutSessions: Rec[]
  subscriptions: Record<string, Rec>
  invoices: Record<string, Rec>
  charges: Record<string, Rec>
  refunds: Rec[]
  prices: Rec[]
  products: Record<string, Rec>
  customers: Record<string, Rec>
  lineItemQuantity: number
  seq: number
  /** Every `tax.calculations.create` params, in call order. */
  taxCalculations: Rec[]
  /** Flat-percentage rates a country charges (uppercase alpha-2). Absent/empty: `not_collecting`. */
  taxRates: Record<string, Array<{ type: string, percentage: string }>>
  /** Countries whose calculation throws `customer_tax_location_invalid` (simulates a missing ZIP). */
  taxInvalidCountries: string[]
  /** Countries Stripe Tax does not cover: a `not_supported`, zero-tax breakdown row. */
  taxUnsupportedCountries: string[]
  taxSettings: Rec
  /** Every `rawRequest` call, in order: `{ method, path, params }`. */
  rawRequests: Rec[]
  /** FX Quotes rates by lowercase source currency. */
  fxRates: Record<string, { exchangeRate: number, baseRate?: number, referenceRate?: number, fxFeeRate?: number }>
  /** Every `rawRequest` to `/v1/fx_quotes` throws. */
  fxUnavailable: boolean
  /** Completed or open checkout sessions `checkout.sessions.list` answers. */
  listedSessions: Rec[]
  creditNotes: Rec[]
  /** Every `creditNotes.preview` params. */
  creditNotePreviews: Rec[]
  /** Every call's request options (`idempotencyKey`), by method. */
  requestOptions: Record<string, Rec[]>
  /**
   * Methods that throw on their next call: name → an error message (a Stripe invalid-request
   * error), an error to throw as it is, or a list of those — one per call, in order.
   */
  failures: Record<string, FakeFailure | FakeFailure[]>
  /** Every `subscriptions.update` / `.cancel` params, in order. */
  subscriptionChanges: Rec[]
  expiredSessions: string[]
}

/** The API version the installed SDK defaults to, read from a real client. */
export const SDK_API_VERSION = (new Stripe('sk_test_offline') as unknown as { getApiField: (key: string) => string })
  .getApiField('version')

export const missing = (what: string): Error => Object.assign(new Error(`No such ${what}`), {
  type: 'StripeInvalidRequestError', code: 'resource_missing', statusCode: 404,
})

/** A Stripe `invalid_request_error`, duck-typed the same way `missing` fakes `resource_missing`. */
export const invalidRequest = (code: string): Error => Object.assign(new Error(code), {
  type: 'StripeInvalidRequestError', code, statusCode: 400,
})

const page = (items: Rec[], params: Rec = {}) => {
  let start = 0
  if (params.starting_after != null) {
    start = items.findIndex(item => item.id === params.starting_after) + 1
  }
  const limit = params.limit ?? 10
  const data = items.slice(start, start + limit)

  return { object: 'list', data: structuredClone(data), has_more: start + limit < items.length }
}

export const makeFakeStripe = (initial: Partial<FakeStripeState> = {}): { stripe: Stripe, state: FakeStripeState } => {
  const state: FakeStripeState = {
    apiVersion: SDK_API_VERSION, calls: [], webhookEndpoints: [], portalConfigurations: [], portalSessions: [],
    checkoutSessions: [], subscriptions: {}, invoices: {}, charges: {}, refunds: [], prices: [], products: {},
    customers: {}, lineItemQuantity: 7, seq: 0,
    taxCalculations: [], taxRates: {}, taxInvalidCountries: [], taxUnsupportedCountries: [],
    taxSettings: { defaults: { tax_behavior: null, tax_code: null }, head_office: null, status: 'active', status_details: {} },
    rawRequests: [], fxRates: {}, fxUnavailable: false,
    listedSessions: [], creditNotes: [], creditNotePreviews: [], requestOptions: {}, failures: {},
    subscriptionChanges: [], expiredSessions: [],
    ...initial,
  }
  const next = (prefix: string): string => `${prefix}_${++state.seq}`
  const call = (name: string, options?: Rec): void => {
    state.calls.push(name)
    if (options != null) (state.requestOptions[name] = state.requestOptions[name] ?? []).push(options)
    const failure = state.failures[name]
    if (failure != null) {
      const next = Array.isArray(failure) ? failure.shift() : failure
      if (!Array.isArray(failure) || failure.length === 0) delete state.failures[name]
      if (next != null) throw typeof next === 'string' ? invalidRequest(next) : next
    }
  }
  const find = (list: Rec[], id: string, what: string): Rec => {
    const found = list.find(item => item.id === id)
    if (found == null) throw missing(what)
    return found
  }

  const stripe = {
    getApiField: (key: string) => key === 'version' ? state.apiVersion : undefined,
    webhookEndpoints: {
      create: async (params: Rec) => {
        call('webhookEndpoints.create')
        const endpoint = {
          id: next('we'), object: 'webhook_endpoint', url: params.url, enabled_events: [...params.enabled_events],
          api_version: params.api_version, description: params.description, metadata: { ...params.metadata },
          status: 'enabled', secret: next('whsec'),
        }
        state.webhookEndpoints.push(endpoint)
        return structuredClone(endpoint)
      },
      update: async (id: string, params: Rec) => {
        call('webhookEndpoints.update')
        const endpoint = find(state.webhookEndpoints, id, 'webhook endpoint')
        Object.assign(endpoint, params)
        const { secret: _secret, ...rest } = endpoint
        return structuredClone(rest)
      },
      retrieve: async (id: string) => {
        call('webhookEndpoints.retrieve')
        const { secret: _secret, ...rest } = find(state.webhookEndpoints, id, 'webhook endpoint')
        return structuredClone(rest)
      },
      del: async (id: string) => {
        call('webhookEndpoints.del')
        find(state.webhookEndpoints, id, 'webhook endpoint')
        state.webhookEndpoints = state.webhookEndpoints.filter(item => item.id !== id)
        return { id, object: 'webhook_endpoint', deleted: true }
      },
      list: async (params: Rec = {}) => {
        call('webhookEndpoints.list')
        return page(state.webhookEndpoints.map(({ secret: _secret, ...rest }) => rest), params)
      },
    },
    billingPortal: {
      configurations: {
        create: async (params: Rec) => {
          call('billingPortal.configurations.create')
          const configuration = { id: next('bpc'), object: 'billing_portal.configuration', active: true, ...structuredClone(params) }
          state.portalConfigurations.push(configuration)
          return structuredClone(configuration)
        },
        retrieve: async (id: string) => {
          call('billingPortal.configurations.retrieve')
          return structuredClone(find(state.portalConfigurations, id, 'configuration'))
        },
        update: async (id: string, params: Rec) => {
          call('billingPortal.configurations.update')
          const configuration = find(state.portalConfigurations, id, 'configuration')
          Object.assign(configuration, structuredClone(params))
          return structuredClone(configuration)
        },
        list: async (params: Rec = {}) => {
          call('billingPortal.configurations.list')
          return page(state.portalConfigurations.filter(item => params.active == null || item.active === params.active), params)
        },
      },
      sessions: {
        create: async (params: Rec) => {
          call('billingPortal.sessions.create')
          state.portalSessions.push(structuredClone(params))
          return { id: next('bps'), url: `https://billing.example.test/p/${state.seq}` }
        },
      },
    },
    subscriptions: {
      retrieve: async (id: string) => {
        call('subscriptions.retrieve')
        const subscription = state.subscriptions[id]
        if (subscription == null) throw missing('subscription')
        return structuredClone(subscription)
      },
      update: async (id: string, params: Rec, options?: Rec) => {
        call('subscriptions.update', options)
        const subscription = state.subscriptions[id]
        if (subscription == null) throw missing('subscription')
        state.subscriptionChanges.push({ id, method: 'update', ...structuredClone(params) })
        Object.assign(subscription, params)
        return structuredClone(subscription)
      },
      cancel: async (id: string, params: Rec = {}, options?: Rec) => {
        call('subscriptions.cancel', options)
        const subscription = state.subscriptions[id]
        if (subscription == null) throw missing('subscription')
        state.subscriptionChanges.push({ id, method: 'cancel', ...structuredClone(params) })
        subscription.status = 'canceled'
        return structuredClone(subscription)
      },
    },
    creditNotes: {
      preview: async (params: Rec) => {
        call('creditNotes.preview')
        state.creditNotePreviews.push(structuredClone(params))
        const invoice = state.invoices[params.invoice]
        if (invoice == null) throw missing('invoice')
        const rate = invoice.subtotal > 0 ? (invoice.tax ?? 0) / invoice.subtotal : 0
        const amount = params.lines.reduce((sum: number, line: Rec) => sum + (line.amount ?? 0), 0)
        const tax = Math.round(amount * rate)
        return { id: 'cnpreview', object: 'credit_note', amount: amount + tax, total: amount + tax, subtotal: amount, currency: invoice.currency }
      },
      create: async (params: Rec, options?: Rec) => {
        call('creditNotes.create', options)
        const invoice = state.invoices[params.invoice]
        if (invoice == null) throw missing('invoice')
        const rate = invoice.subtotal > 0 ? (invoice.tax ?? 0) / invoice.subtotal : 0
        const amount = params.lines.reduce((sum: number, line: Rec) => sum + (line.amount ?? 0), 0)
        const note = {
          id: next('cn'), object: 'credit_note', invoice: params.invoice, refund: params.refund, status: 'issued',
          total: amount + Math.round(amount * rate), currency: invoice.currency, memo: params.memo,
          metadata: { ...params.metadata }, lines: structuredClone(params.lines),
        }
        state.creditNotes.push(note)
        return structuredClone(note)
      },
      list: async (params: Rec = {}) => {
        call('creditNotes.list')
        return page(state.creditNotes.filter(note => params.invoice == null || note.invoice === params.invoice), params)
      },
    },
    invoices: {
      retrieve: async (id: string) => {
        call('invoices.retrieve')
        const invoice = state.invoices[id]
        if (invoice == null) throw missing('invoice')
        return structuredClone(invoice)
      },
    },
    charges: {
      retrieve: async (id: string) => {
        call('charges.retrieve')
        const charge = state.charges[id]
        if (charge == null) throw missing('charge')
        return structuredClone(charge)
      },
    },
    refunds: {
      list: async (params: Rec = {}) => {
        call('refunds.list')
        return page(state.refunds.filter(refund => (params.charge == null || refund.charge === params.charge)
          && (params.payment_intent == null || refund.payment_intent === params.payment_intent)), params)
      },
      create: async (params: Rec, options?: Rec) => {
        call('refunds.create', options)
        const refund = {
          id: next('re'), object: 'refund', amount: params.amount, currency: params.currency ?? 'eur', status: 'succeeded',
          payment_intent: params.payment_intent, charge: null, reason: params.reason, metadata: { ...params.metadata },
        }
        state.refunds.push(refund)
        return structuredClone(refund)
      },
    },
    prices: {
      list: async (params: Rec = {}) => {
        call('prices.list')
        return page(state.prices.filter(price => (params.product == null || price.product === params.product)
          && (params.active == null || price.active === params.active)
          && (params.lookup_keys == null || params.lookup_keys.includes(price.lookup_key))), { limit: 100, ...params })
      },
      create: async (params: Rec) => {
        call('prices.create')
        // Stripe's own default: a price created with no `tax_behavior` is `unspecified`.
        const price = { id: next('price'), active: true, tax_behavior: 'unspecified', ...structuredClone(params) }
        state.prices.push(price)
        return structuredClone(price)
      },
      update: async (id: string, params: Rec) => {
        call('prices.update')
        const price = find(state.prices, id, 'price')
        if (
          params.tax_behavior != null && price.tax_behavior != null && price.tax_behavior !== 'unspecified'
          && price.tax_behavior !== params.tax_behavior
        ) {
          // Real Stripe: once a price's `tax_behavior` is `exclusive` or `inclusive`, it cannot change.
          throw invalidRequest('parameter_invalid_empty')
        }
        Object.assign(price, params)
        return structuredClone(price)
      },
    },
    products: {
      retrieve: async (id: string) => {
        call('products.retrieve')
        if (state.products[id] == null) throw missing('product')
        return structuredClone(state.products[id])
      },
      update: async (id: string, params: Rec) => {
        call('products.update')
        Object.assign(state.products[id], params)
        return structuredClone(state.products[id])
      },
      create: async (params: Rec) => {
        call('products.create')
        state.products[params.id] = structuredClone(params)
        return structuredClone(params)
      },
    },
    customers: {
      retrieve: async (id: string) => {
        call('customers.retrieve')
        if (state.customers[id] == null) throw missing('customer')
        return structuredClone(state.customers[id])
      },
      create: async (params: Rec) => {
        call('customers.create')
        const customer = { id: next('cus'), object: 'customer', address: null, ...structuredClone(params) }
        state.customers[customer.id] = customer
        return structuredClone(customer)
      },
      update: async (id: string, params: Rec) => {
        call('customers.update')
        const customer = state.customers[id]
        if (customer == null) throw missing('customer')
        Object.assign(customer, params)
        return structuredClone(customer)
      },
    },
    checkout: {
      sessions: {
        create: async (params: Rec) => {
          call('checkout.sessions.create')
          state.checkoutSessions.push(structuredClone(params))
          return { id: next('cs'), url: `https://checkout.example.test/${state.seq}` }
        },
        expire: async (id: string) => {
          call('checkout.sessions.expire')
          state.expiredSessions.push(id)
          return { id, status: 'expired' }
        },
        list: async (params: Rec = {}) => {
          call('checkout.sessions.list')
          return page(state.listedSessions.filter(session => (params.status == null || session.status === params.status)
            && (params.created?.gte == null || session.created >= params.created.gte)), params)
        },
        listLineItems: async () => {
          call('checkout.sessions.listLineItems')
          return { data: [{ quantity: state.lineItemQuantity }] }
        },
      },
    },
    tax: {
      calculations: {
        /**
         * A flat-percentage tax model, entirely driven by `state.taxRates` / `taxInvalidCountries`
         * / `taxUnsupportedCountries` — real enough to exercise the status mapping and the
         * scalability rule, never a stand-in for Stripe's actual jurisdiction logic.
         */
        create: async (params: Rec) => {
          call('tax.calculations.create')
          state.taxCalculations.push(structuredClone(params))
          const country = params.customer_details?.address?.country as string | undefined
          if (country != null && state.taxInvalidCountries.includes(country)) {
            throw invalidRequest('customer_tax_location_invalid')
          }
          const lineItem = params.line_items[0]
          const amount: number = lineItem.amount
          const inclusive = lineItem.tax_behavior === 'inclusive'
          const reverseCharge = (params.customer_details?.tax_ids ?? []).length > 0
          const rates = reverseCharge ? [] : (country != null ? state.taxRates[country] ?? [] : [])
          const unsupported = !reverseCharge && rates.length === 0
            && country != null && state.taxUnsupportedCountries.includes(country)

          const breakdown = reverseCharge
            ? [{
              amount: 0, inclusive, taxable_amount: amount, taxability_reason: 'reverse_charge',
              tax_rate_details: { country, state: null, percentage_decimal: '0', tax_type: 'vat' },
            }]
            : unsupported
              ? [{
                amount: 0, inclusive, taxable_amount: amount, taxability_reason: 'not_supported',
                tax_rate_details: null,
              }]
              : rates.length === 0
                ? [{
                  amount: 0, inclusive, taxable_amount: amount, taxability_reason: 'not_collecting',
                  tax_rate_details: { country, state: null, percentage_decimal: '0', tax_type: 'vat' },
                }]
                : rates.map(rate => ({
                  amount: Math.round(amount * Number(rate.percentage) / 100), inclusive, taxable_amount: amount,
                  taxability_reason: 'standard_rated',
                  tax_rate_details: { country, state: null, percentage_decimal: rate.percentage, tax_type: rate.type },
                }))
          const taxTotal = breakdown.reduce((sum, row) => sum + row.amount, 0)

          return {
            id: next('taxcalc'), object: 'tax.calculation', currency: params.currency,
            amount_total: inclusive ? amount : amount + taxTotal,
            tax_amount_exclusive: inclusive ? 0 : taxTotal,
            tax_amount_inclusive: inclusive ? taxTotal : 0,
            tax_breakdown: breakdown,
          }
        },
      },
      settings: {
        retrieve: async () => {
          call('tax.settings.retrieve')
          return structuredClone(state.taxSettings)
        },
      },
    },
    rawRequest: async (method: string, path: string, params: Rec = {}) => {
      call('rawRequest')
      state.rawRequests.push({ method, path, params: structuredClone(params) })
      if (path !== '/v1/fx_quotes') {
        throw new Error(`fake-stripe: unhandled rawRequest path "${path}"`)
      }
      if (state.fxUnavailable) {
        throw new Error('fx_quotes unavailable')
      }
      const local = params['from_currencies[]'] as string
      const rate = state.fxRates[local]
      if (rate == null) {
        return { rates: {} }
      }
      return {
        rates: {
          [local]: {
            exchange_rate: rate.exchangeRate,
            rate_details: {
              base_rate: rate.baseRate ?? rate.exchangeRate,
              reference_rate: rate.referenceRate ?? rate.baseRate ?? rate.exchangeRate,
              fx_fee_rate: rate.fxFeeRate ?? 0.02,
            },
          },
        },
      }
    },
    webhooks: {
      /** Accepts the signature `sig:<secret>` over any body. */
      constructEventAsync: async (raw: string | Buffer, signature: string, secret: string) => {
        if (signature !== `sig:${secret}`) throw new Error('bad signature')
        return JSON.parse(raw.toString())
      },
    },
  }

  return { stripe: stripe as unknown as Stripe, state }
}

// -----------------------------------------------------------------------------------------------
// Stripe objects
// -----------------------------------------------------------------------------------------------

let objectSeq = 0
const epoch = (date: Date): number => Math.floor(date.getTime() / 1000)

export interface SubscriptionShape {
  id?: string
  customer?: string
  entityId?: string
  planSku?: string
  status?: Stripe.Subscription.Status
  itemId?: string
  priceId?: string
  periodStart?: Date
  periodEnd?: Date
  cancelAtPeriodEnd?: boolean
  pauseCollection?: Rec | null
  trialEnd?: Date
  latestInvoice?: string
  created?: Date
  endedAt?: Date
  defaultPaymentMethod?: string
}

export const subscriptionOf = (shape: SubscriptionShape = {}): Stripe.Subscription => ({
  id: shape.id ?? 'sub_1',
  object: 'subscription',
  customer: shape.customer ?? 'cus_1',
  status: shape.status ?? 'active',
  metadata: { ...(shape.entityId !== undefined ? { entityId: shape.entityId } : { entityId: 'entity-1' }) },
  items: {
    object: 'list', has_more: false, url: '',
    data: [{ id: shape.itemId ?? 'si_1', price: { id: shape.priceId ?? `price_${shape.planSku ?? PRO}`, lookup_key: shape.planSku ?? PRO } }],
  },
  current_period_start: epoch(shape.periodStart ?? past(1)),
  current_period_end: epoch(shape.periodEnd ?? future(29)),
  cancel_at_period_end: shape.cancelAtPeriodEnd ?? false,
  canceled_at: null,
  ended_at: shape.endedAt != null ? epoch(shape.endedAt) : null,
  pause_collection: shape.pauseCollection ?? null,
  trial_end: shape.trialEnd != null ? epoch(shape.trialEnd) : null,
  latest_invoice: shape.latestInvoice ?? 'in_1',
  created: epoch(shape.created ?? past(1)),
  default_payment_method: shape.defaultPaymentMethod ?? 'pm_1',
} as unknown as Stripe.Subscription)

export const eventOf = (type: string, object: unknown, overrides: Rec = {}): Stripe.Event => ({
  id: `evt_${++objectSeq}`, object: 'event', type, created: epoch(new Date()), data: { object }, ...overrides,
} as unknown as Stripe.Event)

// -----------------------------------------------------------------------------------------------
// In-memory resources
// -----------------------------------------------------------------------------------------------

const duplicate = (): Error => Object.assign(new Error('E11000 duplicate key error'), { code: 11000 })

const plain = (value: unknown): unknown => value instanceof Date ? value.getTime() : value

const withoutUndefined = <T extends Rec>(record: T): T =>
  Object.fromEntries(Object.entries(record).filter(([, value]) => value !== undefined)) as T

const applyUpdate = (doc: Rec, update: Rec, inserting: boolean): void => {
  for (const [key, value] of Object.entries(update.$set ?? {})) {
    if (value === undefined) continue
    doc[key] = value
  }
  for (const [key, value] of Object.entries(update.$inc ?? {})) {
    doc[key] = (doc[key] ?? 0) + (value as number)
  }
  for (const key of Object.keys(update.$unset ?? {})) {
    delete doc[key]
  }
  if (inserting) {
    Object.assign(doc, update.$setOnInsert ?? {})
  }
}

export interface MemoryStore {
  rows: Rec[]
  /** Make the next calls of a method throw. */
  failing: Set<string>
}

/**
 * Turn a real resource (its maker's indexes and helpers kept) into an in-memory one over the shared
 * criteria engine, including the raw collection calls the package makes: the conditional counter
 * upsert, `$inc` / `$set` / `$unset`, `$match` + `$group` aggregation and `distinct`.
 */
export const memoryResource = <T extends ResourceRecord>(resource: MongoResource<T>): MemoryStore => {
  const store: MemoryStore = { rows: [], failing: new Set() }
  const unique = (resource.indexes ?? []).filter(index => index.options?.unique === true)
    .map(index => ({ keys: Object.keys(index.index as Rec), sparse: index.options?.sparse === true }))
  let seq = 0
  const guard = (method: string): void => {
    if (store.failing.has(method)) throw new Error(`${resource.alias}.${method} unavailable`)
  }
  // A sparse unique index ignores a document that carries none of its keys (as Mongo does).
  const violates = (doc: Rec, self?: Rec): boolean => unique.some(({ keys, sparse }) =>
    !(sparse && keys.every(key => doc[key] == null)) && store.rows.some(row =>
      row !== self && keys.every(key => plain(row[key] ?? null) === plain(doc[key] ?? null))))
  const out = (row: Rec): T => structuredClone(row) as T
  const byId = (id: string) => store.rows.find(row => row.id === id)

  const target = resource as unknown as Rec
  target.init = async () => undefined
  target.get = async (idOrWhere: string | Criteria<T>, opts?: { sort?: never[] }) => {
    guard('get')
    const row = typeof idOrWhere === 'string' ? byId(idOrWhere) : firstMatch(store.rows, idOrWhere as Criteria<any>, opts)
    if (row == null) throw new UnknownRecordError(JSON.stringify(idOrWhere))
    return out(row)
  }
  target.load = async (idOrWhere: string | Criteria<T>, opts?: { sort?: never[] }) => {
    guard('load')
    const row = typeof idOrWhere === 'string' ? byId(idOrWhere) : firstMatch(store.rows, idOrWhere as Criteria<any>, opts)
    return row == null ? null : out(row)
  }
  target.list = async (where?: Criteria<T>, opts?: ListOptions<T>) => {
    guard('list')
    const result = applyQuery(store.rows, where as Criteria<any>, opts as ListOptions<any>)
    return { ...result, items: result.items.map(out) }
  }
  target.count = async (where?: Criteria<T>) => store.rows.filter(row => matchCriteria(row, where)).length
  target.create = async (record: Rec) => {
    guard('create')
    if (record.id != null) throw new RecordExists('id-present')
    const doc = withoutUndefined(structuredClone(record))
    delete doc.id
    if (violates(doc)) throw duplicate()
    doc.id = `${resource.alias}-${++seq}`
    store.rows.push(doc)
    return out(doc)
  }
  target.update = async (record: Rec) => {
    guard('update')
    const existing = byId(record.id)
    if (existing == null) throw new UnknownRecordError(String(record.id))
    const doc = withoutUndefined(structuredClone(record))
    if (violates(doc, existing)) throw duplicate()
    store.rows[store.rows.indexOf(existing)] = doc
    return out(doc)
  }
  target.save = async (record: Rec) => record.id != null ? await target.update(record) : await target.create(record)
  target.delete = async (id: string) => {
    const row = byId(id)
    if (row == null) return null
    store.rows = store.rows.filter(item => item !== row)
    return out(row)
  }
  target.purge = async (where: Criteria<T>) => {
    const before = store.rows.length
    store.rows = store.rows.filter(row => !matchCriteria(row, where))
    return before - store.rows.length
  }

  const matchRaw = (filter: Rec) => store.rows.find(row => matchCriteria(row, filter))
  const upsert = (filter: Rec, update: Rec, opts: Rec = {}): { doc: Rec | null, inserted: boolean } => {
    const found = matchRaw(filter)
    if (found != null) {
      applyUpdate(found, update, false)
      return { doc: found, inserted: false }
    }
    if (opts.upsert !== true) return { doc: null, inserted: false }
    const doc: Rec = Object.fromEntries(Object.entries(filter).filter(([, value]) =>
      value === null || typeof value !== 'object' || value instanceof Date))
    applyUpdate(doc, update, true)
    if (violates(doc)) throw duplicate()
    doc.id = `${resource.alias}-${++seq}`
    store.rows.push(doc)
    return { doc, inserted: true }
  }
  target.collection = {
    findOneAndUpdate: async (filter: Rec, update: Rec, opts: Rec = {}) => {
      guard('findOneAndUpdate')
      const before = matchRaw(filter)
      const snapshot = before != null ? structuredClone(before) : null
      const { doc } = upsert(filter, update, opts)
      if (doc == null) return null
      const result = opts.returnDocument === 'after' ? doc : snapshot
      return result == null ? null : { ...structuredClone(result), _id: result.id }
    },
    updateOne: async (filter: Rec, update: Rec, opts: Rec = {}) => {
      guard('updateOne')
      // Like Mongo: an update is checked against the unique indexes before it lands.
      const found = matchRaw(filter)
      if (found != null) {
        const candidate = structuredClone(found)
        applyUpdate(candidate, update, false)
        if (violates(candidate, found)) throw duplicate()
      }
      const { doc, inserted } = upsert(filter, update, opts)
      return { matchedCount: doc != null && !inserted ? 1 : 0, upsertedCount: inserted ? 1 : 0 }
    },
    deleteOne: async (filter: Rec) => {
      const row = matchRaw(filter)
      store.rows = store.rows.filter(item => item !== row)
      return { deletedCount: row != null ? 1 : 0 }
    },
    distinct: async (field: string, filter: Rec = {}) =>
      [...new Set(store.rows.filter(row => matchCriteria(row, filter)).map(row => row[field]))],
    aggregate: (pipeline: Rec[]) => ({
      toArray: async () => {
        guard('aggregate')
        let docs: Rec[] = store.rows.map(row => structuredClone(row))
        for (const stage of pipeline) {
          if (stage.$match != null) {
            docs = docs.filter(doc => matchCriteria(doc, stage.$match))
          } else if (stage.$group != null) {
            const groups = new Map<string, Rec>()
            const { _id: key, ...accumulators } = stage.$group
            for (const doc of docs) {
              const id = Object.fromEntries(Object.entries(key as Rec).map(([name, ref]) => [name, doc[(ref as string).slice(1)]]))
              const hash = JSON.stringify(id)
              const group = groups.get(hash) ?? { _id: id }
              for (const [name, spec] of Object.entries(accumulators as Rec)) {
                group[name] = (group[name] ?? 0) + (doc[(spec.$sum as string).slice(1)] ?? 0)
              }
              groups.set(hash, group)
            }
            docs = [...groups.values()]
          } else {
            throw new Error(`unsupported stage ${JSON.stringify(stage)}`)
          }
        }
        return docs
      },
    }),
  }

  return store
}

// -----------------------------------------------------------------------------------------------
// Context
// -----------------------------------------------------------------------------------------------

export interface FakeContextOptions {
  catalogue?: CatalogueOptions
  /** Declare the catalogue yourself instead. */
  declare?: (cfg: Config) => void
  /** The public host of the service (default `api.example.com`). */
  host?: string
  /** The configured webhook override secret. */
  webhookSecret?: string
  portal?: PortalBrandingDef
  pricing?: PricingDef
  stripe?: Partial<FakeStripeState>
  /** Declare a consumer-rights policy (with trader and mail options). */
  consumerRights?: ConsumerRightsDef
  /** The consumer-rights usage meter. */
  meter?: UsageMeter
  /** Register a console mailer under `MAILER_SERVICE` (default true). */
  mailer?: boolean
  /** Register the gateway before the application's consumer-rights call (default: after). */
  gatewayFirst?: boolean
  /** The application's consumer-rights options (default: managed through the fake, with `meter`). */
  rights?: (stripe: Stripe) => ConsumerRightsOptions
  /** The gateway's `manage` (default false). */
  gatewayManage?: boolean
  /** Run on the context after the registrations, before it is configured and initialized. */
  wire?: (ctx: ApiContext) => void
}

export interface Observed {
  topUp: TopUpCompletion[]
  subscription: SubscriptionEvent[]
  refund: RefundEvent[]
  dispute: DisputeEvent[]
  paymentFailed: PaymentFailedEvent[]
  consent: ConsentEvent[]
  withdrawal: WithdrawalEvent[]
  cancellation: CancellationEvent[]
  /** Throw from the next `n` subscription callbacks. */
  failSubscription: number
  failTopUp: number
  failWithdrawal: number
  /** Run inside every top-up / subscription callback, before it records the event. */
  onTopUp?: (event: TopUpCompletion) => Promise<void>
  onSubscription?: (event: SubscriptionEvent) => Promise<void>
}

export interface FakeContext {
  ctx: ApiContext
  stripe: Stripe
  state: FakeStripeState
  stores: Record<string, MemoryStore>
  observed: Observed
  /** Every mail the console mailer took. */
  mails: MailMessage[]
  /** The console mailer — replace its `send` to simulate a transport failure. */
  mailer: ReturnType<typeof makeConsoleMailerService>
}

/**
 * A real server context — real catalogue, payment service, observer, gateway (unmanaged), gates and
 * entitlement service — over in-memory resources, with a fake Stripe for the plugin functions.
 */
export const makeFakeContext = async (opts: FakeContextOptions = {}): Promise<FakeContext> => {
  const cfg = serverConfig<ServerConfig>(SERVICE, {
    services: {
      [SERVICE]: { service: SERVICE, type: AppType.Backend, host: opts.host ?? HOST },
    },
  } as Partial<ServerConfig>) as unknown as Config
  if (opts.declare != null) {
    opts.declare(cfg)
  } else {
    declareTestCatalogue(cfg, opts.catalogue)
  }
  stripeSecrets(cfg, { api: 'sk_test_offline', ...(opts.webhookSecret != null ? { webhook: opts.webhookSecret } : {}) })
  if (opts.portal != null) {
    portalBranding(cfg, opts.portal)
  }
  if (opts.pricing != null) {
    declarePaymentPricing(cfg, opts.pricing)
  }
  if (opts.consumerRights != null) {
    declareConsumerRights(cfg, opts.consumerRights)
  }

  const ctx = makeServerContext(cfg as unknown as ServerConfig) as unknown as ApiContext
  const stores: Record<string, MemoryStore> = {}
  const resources = [
    [RES_PAYGATE_CUSTOMER, makePaygateCustomerResource()],
    [RES_PAYMENT_SUBSCRIPTION, makeSubscriptionResource()],
    [RES_PAYMENT_FULFILLMENT, makeFulfillmentResource()],
    [RES_PAYMENT_WEBHOOK, makeWebhookResource()],
    [RES_PAYMENT_USAGE, makeUsageResource()],
    [RES_PAYMENT_USAGE_COUNTER, makeUsageCounterResource()],
    [RES_PAYMENT_FINGERPRINT, makeFingerprintResource()],
    [RES_BILLING_PROFILE, makeBillingProfileResource()],
    [RES_PAYMENT_PURCHASE, makePurchaseResource()],
    [RES_CONSUMER_CONSENT, makeConsumerConsentResource()],
    [RES_CONSUMER_DECLARATION, makeConsumerDeclarationResource()],
    [RES_CONSUMER_EVENT, makeConsumerEventResource()],
  ] as const
  for (const [alias, resource] of resources) {
    stores[alias] = memoryResource(resource as unknown as MongoResource<ResourceRecord>)
    ctx.registerResource(resource as never)
  }
  const { stripe, state } = makeFakeStripe(opts.stripe)
  const mailer = makeConsoleMailerService(MAILER_SERVICE)
  if (opts.mailer !== false) {
    ctx.registerService(mailer)
  }
  // The consumer-rights service manages the paygate through the fake; the gateway stays unmanaged.
  const rights = opts.rights?.(stripe)
    ?? { manage: true, stripe: async () => stripe, ...(opts.meter != null ? { usage: opts.meter } : {}) }
  const gatewayOpts = { manage: opts.gatewayManage ?? false }
  if (opts.gatewayFirst === true) {
    appendPaymentGatewayService(ctx as never, gatewayOpts)
    appendConsumerRights(ctx as never, rights)
  } else {
    appendConsumerRights(ctx as never, rights)
    appendPaymentGatewayService(ctx as never, gatewayOpts)
  }
  opts.wire?.(ctx)
  ctx.configure()
  await ctx.init()

  const observed: Observed = {
    topUp: [], subscription: [], refund: [], dispute: [], paymentFailed: [], consent: [], withdrawal: [],
    cancellation: [], failSubscription: 0, failTopUp: 0, failWithdrawal: 0,
  }
  const completions = observer(ctx)
  await completions.ready()
  completions.onTopUp(async event => {
    if (observed.failTopUp > 0) {
      observed.failTopUp--
      throw new Error('ledger unavailable')
    }
    await observed.onTopUp?.(event)
    observed.topUp.push(event)
  })
  completions.onSubscription(async event => {
    if (observed.failSubscription > 0) {
      observed.failSubscription--
      throw new Error('observer unavailable')
    }
    await observed.onSubscription?.(event)
    observed.subscription.push(event)
  })
  completions.onRefund(async event => { observed.refund.push(event) })
  completions.onDispute(async event => { observed.dispute.push(event) })
  completions.onPaymentFailed(async event => { observed.paymentFailed.push(event) })
  completions.onConsent(async event => { observed.consent.push(event) })
  completions.onWithdrawal(async event => {
    if (observed.failWithdrawal > 0) {
      observed.failWithdrawal--
      throw new Error('ledger unavailable')
    }
    observed.withdrawal.push(event)
  })
  completions.onCancellation(async event => { observed.cancellation.push(event) })

  return { ctx, stripe, state, stores, observed, mails: mailer.captured, mailer }
}
