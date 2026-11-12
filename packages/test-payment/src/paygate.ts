import { PaygateSignatureError, ProductError, type TaxEstimate } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import {
  paymentAccessOf, type CheckoutPage, type CustomerInput, type Paygate, type PaygateCustomer, type PaygateFeatures,
} from '@owlmeans/server-payment'
import { FAKE_PAYGATE, FAKE_SIGNATURE } from './consts.js'
import type { FakeCapability, FakePaygate, FakePaygateOptions, FakePaygateState } from './paygate/types.js'

const FAKE_FEATURES: PaygateFeatures = {
  automaticTax: true, taxIdCollection: true, adaptiveCurrency: true, termsConsent: true,
  sessionTtl: { minSeconds: 30 * 60, maxSeconds: 24 * 60 * 60 },
}

/** A deep copy without functions (a lazy deployment of a portal session) — what a recorded call keeps. */
const snapshot = (value: unknown): unknown => {
  if (value instanceof Date) return new Date(value.getTime())
  if (Array.isArray(value)) return value.map(snapshot)
  if (value != null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).filter(([, entry]) => typeof entry !== 'function')
      .map(([key, entry]) => [key, snapshot(entry)]))
  }
  return value
}


/**
 * A paygate held in memory: every capability (or the ones `without` leaves out), recording every call
 * with its arguments in `state.calls` and failing a method's next calls on `state.failures`. Register
 * it with `ensurePaymentProviders(ctx).register(fake.provider)` — `makeFakeContext` does by default.
 * A verified delivery (`x-fake-signature: ok`) answers the queued `state.pending` events.
 */
export const makeFakePaygate = (opts: FakePaygateOptions = {}): FakePaygate => {
  const id = opts.id ?? FAKE_PAYGATE
  const without = new Set<FakeCapability>(opts.without ?? [])
  const features: PaygateFeatures = { ...FAKE_FEATURES, ...opts.features }
  const state: FakePaygateState = {
    calls: [], failures: {}, locks: { email: false, country: false }, customers: {}, sessions: [], expired: [], units: 1,
    completed: [], subscriptions: {}, invoices: {}, charges: {}, refunds: [], creditNotes: [], prices: {}, synced: [],
    quotes: {}, tax: null, pending: [], endpoints: [], configurations: [], portalSessions: [], seq: 0,
    ...opts.state,
  }
  const next = (prefix: string): string => `${prefix}_${++state.seq}`
  const call = (method: string, ...args: unknown[]): void => {
    state.calls.push({ method, args: args.filter(arg => typeof arg !== 'function').map(snapshot) })
    const failure = state.failures[method]
    if (failure != null) {
      const error = Array.isArray(failure) ? failure.shift() : failure
      if (!Array.isArray(failure) || failure.length === 0) delete state.failures[method]
      if (error != null) throw typeof error === 'string' ? new Error(error) : error
    }
  }
  const matches = (metadata: Record<string, string>, match: Record<string, string>): boolean =>
    Object.entries(match).every(([key, value]) => metadata[key] === value)

  const bind = (ctx: ApiContext): Paygate => {
    const customers = {
      ensure: async (input: CustomerInput): Promise<PaygateCustomer> => {
        call('customers.ensure', input)
        const resource = paymentAccessOf(ctx).paygateCustomers()
        const row = await resource.byEntity(input.entityId, id)
        const known = row != null && row.deletedAt == null ? state.customers[row.externalId] : undefined
        if (known != null) {
          if (input.email != null) known.email = input.email
          return structuredClone(known)
        }
        const customer: PaygateCustomer = { id: next('cus'), taxLocatable: false, ...(input.email != null ? { email: input.email } : {}) }
        state.customers[customer.id] = customer
        if (row != null) {
          const { deletedAt: _deleted, ...kept } = row
          await resource.update({ ...kept, externalId: customer.id })
        } else {
          await resource.create({ paygate: id, externalId: customer.id, entityId: input.entityId, ...(input.profileId != null ? { profileId: input.profileId } : {}) })
        }
        return structuredClone(customer)
      },
      retrieve: async (customerId: string, options?: { taxIds?: boolean }) => {
        call('customers.retrieve', customerId, options)
        const customer = state.customers[customerId]
        return customer != null ? structuredClone(customer) : null
      },
      setCountry: async (customerId: string, country: string, options: { replace: boolean }) => {
        call('customers.setCountry', customerId, country, options)
        const customer = state.customers[customerId]
        customer.country = country
        customer.taxLocatable = true
        return structuredClone(customer)
      },
      locks: async () => state.locks,
    }

    const checkout = {
      createSession: async (input: Parameters<Paygate['checkout']['createSession']>[0]) => {
        call('checkout.createSession', input)
        state.sessions.push(structuredClone(input))
        const sessionId = next('cs')
        return { id: sessionId, url: state.sessionUrl === undefined ? `https://pay.example.test/${sessionId}` : state.sessionUrl }
      },
      expireSession: async (sessionId: string) => { call('checkout.expireSession', sessionId); state.expired.push(sessionId) },
      units: async (sessionId: string) => { call('checkout.units', sessionId); return state.units },
      ...(without.has('listCompleted') ? {} : {
        listCompleted: async (since: Date, cursor?: string): Promise<CheckoutPage> => {
          call('checkout.listCompleted', since, cursor)
          const listed = state.completed.filter(session => session.createdAt == null || session.createdAt >= since)
          const start = cursor != null ? listed.findIndex(session => session.id === cursor) + 1 : 0
          const items = listed.slice(start, start + 100)
          return { items: structuredClone(items), ...(start + 100 < listed.length ? { cursor: items[items.length - 1].id } : {}) }
        },
      }),
    }

    const subscriptions = {
      retrieve: async (subscriptionId: string) => {
        call('subscriptions.retrieve', subscriptionId)
        const found = state.subscriptions[subscriptionId]
        return found != null ? structuredClone(found) : null
      },
      cancelNow: async (subscriptionId: string, paygateCall: unknown) => {
        call('subscriptions.cancelNow', subscriptionId, paygateCall)
        const found = state.subscriptions[subscriptionId]
        if (found == null) return { alreadyCanceled: true }
        found.externalStatus = 'canceled'
        return { alreadyCanceled: false }
      },
      scheduleCancel: async (subscriptionId: string, when: unknown, paygateCall: unknown) => {
        call('subscriptions.scheduleCancel', subscriptionId, when, paygateCall)
      },
    }

    const creditNotes = {
      preview: async (line: { invoiceId: string, lineId: string, amountMinor: number }) => {
        call('payments.creditNotes.preview', line)
        return { totalMinor: line.amountMinor }
      },
      create: async (input: { invoiceId: string, amountMinor: number, metadata: Record<string, string> }, paygateCall: unknown) => {
        call('payments.creditNotes.create', input, paygateCall)
        const note = { id: next('cn'), invoiceId: input.invoiceId, totalMinor: input.amountMinor, currency: state.invoices[input.invoiceId]?.currency ?? 'usd', metadata: { ...input.metadata } }
        state.creditNotes.push(note)
        return { id: note.id, totalMinor: note.totalMinor, currency: note.currency }
      },
      find: async (invoiceId: string, metadata: Record<string, string>) => {
        call('payments.creditNotes.find', invoiceId, metadata)
        const note = state.creditNotes.find(entry => entry.invoiceId === invoiceId && matches(entry.metadata, metadata))
        return note != null ? { id: note.id, totalMinor: note.totalMinor, currency: note.currency } : null
      },
    }

    const payments = {
      charge: async (chargeId: string) => { call('payments.charge', chargeId); return state.charges[chargeId] ?? null },
      invoice: async (invoiceId: string) => { call('payments.invoice', invoiceId); return state.invoices[invoiceId] ?? null },
      refund: async (input: { paymentId: string, amountMinor: number, metadata: Record<string, string> }, paygateCall: unknown) => {
        call('payments.refund', input, paygateCall)
        const refund = {
          id: next('re'), status: 'succeeded', succeeded: true, amountMinor: input.amountMinor, currency: 'usd',
          paymentId: input.paymentId, metadata: { ...input.metadata },
        }
        state.refunds.push(refund)
        return structuredClone(refund)
      },
      findRefund: async (paymentId: string, metadata: Record<string, string>) => {
        call('payments.findRefund', paymentId, metadata)
        const refund = state.refunds.find(entry => entry.paymentId === paymentId && matches(entry.metadata, metadata))
        return refund != null ? structuredClone(refund) : null
      },
      ...(without.has('creditNotes') ? {} : { creditNotes }),
    }

    const webhook = {
      verify: async (delivery: { headers: Record<string, string | string[] | undefined> }) => {
        call('webhook.verify')
        if (delivery.headers[FAKE_SIGNATURE] !== 'ok') throw new PaygateSignatureError()
        return state.pending.splice(0)
      },
      ensureEndpoint: async (deployment: { owner: string, webhookUrl: string }, options?: unknown) => {
        call('webhook.ensureEndpoint', deployment, options)
        state.endpoints.push({ ...deployment })
        return null
      },
    }

    const catalogue = {
      price: async (productSku: string, lookupKey: string) => {
        call('catalogue.price', productSku, lookupKey)
        const price = state.prices[lookupKey]
        if (price == null) throw new ProductError(`price:${lookupKey}`)
        return structuredClone(price)
      },
      syncProduct: async (product: { sku: string }, plans: Array<{ plan: { sku: string }, lookupKey: string, unitAmountMinor: number, currency: string }>, options: unknown) => {
        call('catalogue.syncProduct', product.sku, plans.map(plan => plan.plan.sku), options)
        state.synced.push({ productSku: product.sku, plans: plans.map(plan => plan.plan.sku) })
        return {
          productId: product.sku,
          prices: plans.map(plan => {
            const price = state.prices[plan.lookupKey] ?? (state.prices[plan.lookupKey] = { id: next('price'), currency: plan.currency, unitAmountMinor: plan.unitAmountMinor, options: {} })
            return { planSku: plan.plan.sku, priceId: price.id }
          }),
        }
      },
    }

    const portal = {
      ensureConfiguration: async (deployment: { owner: string, webhookUrl: string }, options?: unknown) => {
        call('portal.ensureConfiguration', deployment, options)
        state.configurations.push({ ...deployment })
        return 'config_fake'
      },
      createSession: async (input: Parameters<NonNullable<Paygate['portal']>['createSession']>[0]) => {
        call('portal.createSession', input)
        state.portalSessions.push(input)
        return `https://portal.example.test/${next('ps')}`
      },
    }

    const tax = {
      calculate: async (input: Parameters<NonNullable<Paygate['tax']>['calculate']>[0]): Promise<TaxEstimate | null> => {
        call('tax.calculate', input)
        return typeof state.tax === 'function' ? state.tax(input) : state.tax
      },
    }

    const fx = {
      quote: async (from: string, to: string) => {
        call('fx.quote', from, to)
        return state.quotes[`${from}:${to}`] ?? null
      },
    }

    return {
      id,
      features,
      settlementCurrency: async () => state.settlementCurrency,
      customers,
      checkout,
      ...(without.has('subscriptions') ? {} : { subscriptions }),
      ...(without.has('payments') ? {} : { payments }),
      ...(without.has('webhook') ? {} : { webhook }),
      ...(without.has('catalogue') ? {} : { catalogue }),
      ...(without.has('portal') ? {} : { portal }),
      ...(without.has('tax') ? {} : { tax }),
      ...(without.has('fx') ? {} : { fx }),
    } as Paygate
  }

  return { provider: { id, features, bind }, state }
}
