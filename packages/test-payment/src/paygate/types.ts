import type {
  CheckoutSnapshot, CustomerLocks, FxQuote, PaygateCharge, PaygateCustomer, PaygateDeployment, PaygateEvent,
  PaygateFeatures, PaygateInvoice, PaygatePrice, PaygateRefund, PaygateSubscription, PaymentProvider, PortalSessionInput,
  SessionInput, TaxInput,
} from '@owlmeans/server-payment'
import type { TaxEstimate } from '@owlmeans/payment'

/** A capability `makeFakePaygate` can leave out, to drive the host's reaction to its absence. */
export type FakeCapability =
  | 'subscriptions' | 'payments' | 'creditNotes' | 'webhook' | 'catalogue' | 'portal' | 'tax' | 'fx' | 'listCompleted'

export interface FakeCall {
  /** `checkout.createSession`, `payments.refund`, … */
  method: string
  args: unknown[]
}

/** Everything the fake paygate holds, and every call made to it — "no paygate call" is an assertion. */
export interface FakePaygateState {
  calls: FakeCall[]
  /** Methods that throw on their next call: a message or an error, or a list of them (one per call). */
  failures: Record<string, string | Error | Array<string | Error>>
  settlementCurrency?: string
  locks: CustomerLocks
  customers: Record<string, PaygateCustomer>
  /** Every session the host asked for, in order. */
  sessions: SessionInput[]
  /** What `createSession` answers: a URL per session (default `https://pay.example.test/<n>`), `null` for none. */
  sessionUrl?: string | null
  expired: string[]
  /** What `checkout.units` answers. */
  units: number
  /** What `checkout.listCompleted` pages through. */
  completed: CheckoutSnapshot[]
  subscriptions: Record<string, PaygateSubscription>
  invoices: Record<string, PaygateInvoice>
  charges: Record<string, PaygateCharge>
  refunds: Array<PaygateRefund & { paymentId?: string }>
  creditNotes: Array<{ id: string, invoiceId: string, totalMinor: number, currency: string, metadata: Record<string, string> }>
  /** Reusable prices by lookup key. */
  prices: Record<string, PaygatePrice>
  /** Every `catalogue.syncProduct`, in order. */
  synced: Array<{ productSku: string, plans: string[] }>
  /** FX quotes by `<from>:<to>`. */
  quotes: Record<string, FxQuote>
  /** What `tax.calculate` answers. */
  tax: TaxEstimate | null | ((input: TaxInput) => TaxEstimate | null)
  /** The events the next verified delivery answers. */
  pending: PaygateEvent[]
  endpoints: PaygateDeployment[]
  configurations: PaygateDeployment[]
  portalSessions: PortalSessionInput[]
  seq: number
}

export interface FakePaygateOptions {
  /** The paygate id (default `fake`). */
  id?: string
  /** Feature flags over the default (every feature on, no text limit, sessions 30 min – 24 h). */
  features?: Partial<PaygateFeatures>
  /** Capabilities left out. */
  without?: FakeCapability[]
  state?: Partial<FakePaygateState>
}

export interface FakePaygate {
  provider: PaymentProvider
  state: FakePaygateState
}
