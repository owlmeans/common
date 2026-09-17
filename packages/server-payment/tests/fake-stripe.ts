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
import type { Context as ApiContext } from '@owlmeans/server-api'
import {
  declarePaymentPlan, declarePaymentProduct, portalBranding, stripeSecrets,
} from '../src/config.js'
import {
  RES_PAYGATE_CUSTOMER, RES_PAYMENT_FINGERPRINT, RES_PAYMENT_FULFILLMENT, RES_PAYMENT_SUBSCRIPTION,
  RES_PAYMENT_USAGE, RES_PAYMENT_USAGE_COUNTER, RES_PAYMENT_WEBHOOK,
} from '../src/consts.js'
import {
  makeFingerprintResource, makeFulfillmentResource, makePaygateCustomerResource, makeSubscriptionResource,
  makeUsageCounterResource, makeUsageResource, makeWebhookResource,
} from '../src/resource.js'
import { appendPaymentGatewayService } from '../src/service.js'
import { observer } from '../src/utils.js'
import type {
  Config, DisputeEvent, PaymentFailedEvent, PaymentPlanDef, PortalBrandingDef, RefundEvent,
  SubscriptionEvent, TopUpCompletion,
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
}

/** The API version the installed SDK defaults to, read from a real client. */
export const SDK_API_VERSION = (new Stripe('sk_test_offline') as unknown as { getApiField: (key: string) => string })
  .getApiField('version')

export const missing = (what: string): Error => Object.assign(new Error(`No such ${what}`), {
  type: 'StripeInvalidRequestError', code: 'resource_missing', statusCode: 404,
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
    customers: {}, lineItemQuantity: 7, seq: 0, ...initial,
  }
  const next = (prefix: string): string => `${prefix}_${++state.seq}`
  const call = (name: string): void => { state.calls.push(name) }
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
        return page(state.refunds.filter(refund => params.charge == null || refund.charge === params.charge), params)
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
        const price = { id: next('price'), active: true, ...structuredClone(params) }
        state.prices.push(price)
        return structuredClone(price)
      },
      update: async (id: string, params: Rec) => {
        call('prices.update')
        Object.assign(find(state.prices, id, 'price'), params)
        return structuredClone(find(state.prices, id, 'price'))
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
        const customer = { id: next('cus'), object: 'customer', ...structuredClone(params) }
        state.customers[customer.id] = customer
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
        listLineItems: async () => {
          call('checkout.sessions.listLineItems')
          return { data: [{ quantity: state.lineItemQuantity }] }
        },
      },
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
    .map(index => Object.keys(index.index as Rec))
  let seq = 0
  const guard = (method: string): void => {
    if (store.failing.has(method)) throw new Error(`${resource.alias}.${method} unavailable`)
  }
  const violates = (doc: Rec, self?: Rec): boolean => unique.some(keys => store.rows.some(row =>
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
  stripe?: Partial<FakeStripeState>
}

export interface Observed {
  topUp: TopUpCompletion[]
  subscription: SubscriptionEvent[]
  refund: RefundEvent[]
  dispute: DisputeEvent[]
  paymentFailed: PaymentFailedEvent[]
  /** Throw from the next `n` subscription callbacks. */
  failSubscription: number
  failTopUp: number
}

export interface FakeContext {
  ctx: ApiContext
  stripe: Stripe
  state: FakeStripeState
  stores: Record<string, MemoryStore>
  observed: Observed
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
  ] as const
  for (const [alias, resource] of resources) {
    stores[alias] = memoryResource(resource as unknown as MongoResource<ResourceRecord>)
    ctx.registerResource(resource as never)
  }
  appendPaymentGatewayService(ctx as never, { manage: false })
  ctx.configure()
  await ctx.init()

  const observed: Observed = {
    topUp: [], subscription: [], refund: [], dispute: [], paymentFailed: [], failSubscription: 0, failTopUp: 0,
  }
  const completions = observer(ctx)
  await completions.ready()
  completions.onTopUp(async event => {
    if (observed.failTopUp > 0) {
      observed.failTopUp--
      throw new Error('ledger unavailable')
    }
    observed.topUp.push(event)
  })
  completions.onSubscription(async event => {
    if (observed.failSubscription > 0) {
      observed.failSubscription--
      throw new Error('observer unavailable')
    }
    observed.subscription.push(event)
  })
  completions.onRefund(async event => { observed.refund.push(event) })
  completions.onDispute(async event => { observed.dispute.push(event) })
  completions.onPaymentFailed(async event => { observed.paymentFailed.push(event) })

  const { stripe, state } = makeFakeStripe(opts.stripe)

  return { ctx, stripe, state, stores, observed }
}
