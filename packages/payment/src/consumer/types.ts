import type { ConsumerRightsMechanisms, ConsumerRightsPolicy, BillingProfileView, CancellationBody, CancellationReceipt, ConsumerRightsPublicView, DeclarationReceipt, PerformanceConsentBody, PerformanceConsentResponse, PerformanceConsentView, PurchaseList, SubscriptionStartBody, SubscriptionStartQuery, SubscriptionStartResponse, SubscriptionStartView, WithdrawalBody, WithdrawalCandidateList, WithdrawalReceipt, PlanWithdrawalComponent } from '../types.js'
import type { RouteParent } from '@owlmeans/route'
import type { EntrypointOptions, EntrypointProtocol, OpenRequest, OpenValue } from '@owlmeans/entrypoint'
import type { PublicOf } from './types.local.js'

export type BillingInterval = 'month' | 'year'

/** A copy bundle: nested keys, string leaves. */
export interface CopyTree {
  [key: string]: string | CopyTree
}

export type CopyValues = Record<string, string | number>

export interface LegalLabels {
  withdrawal: { function: string, confirm: string }
  cancellation: { function: string, confirm: string }
}

export interface ConsentStatement {
  request: string
  acknowledgement: string
  /** The checkbox text: the request and the acknowledgement together. */
  checkbox: string
}

export interface WithdrawalDeadlineRule {
  /** Default 14. */
  days?: number
  /** A period ending on a Saturday or Sunday ends on the Monday after. Default on. */
  weekendRollover?: boolean
  /** Whole days added after the rollover, covering public holidays. Default 5. */
  marginDays?: number
}

/** What decides whether a purchase can still be withdrawn from. */
export interface WithdrawalWindow {
  deadline?: Date | null
  withdrawnAt?: Date | null
  refundedAt?: Date | null
}

/** Units granted at one instant — a purchase's credits. */
export interface FifoLot {
  id: string
  units: number
  at: Date
}

/** Units spent at one instant. */
export interface FifoSpend {
  units: number
  at: Date
}

/** One lot after allocation, with every slice of it a spend took. */
export interface FifoLotUsage {
  id: string
  at: Date
  granted: number
  used: number
  slices: Array<{ at: Date, units: number }>
}

export interface FifoAllocation {
  lots: FifoLotUsage[]
  /** Spent units no lot granted at or before the spend could cover. */
  unallocated: number
}

// Kept as a type: its parts redeclare the same keys with narrower types, which interface `extends` refuses.
/** What an application must state itself; everything else defaults. */
export type ConsumerRightsDeclaration = Partial<Omit<ConsumerRightsPolicy, 'mechanisms' | 'deadline'>>
  & Pick<ConsumerRightsPolicy, 'textVersion' | 'links'>
  & { mechanisms?: Partial<ConsumerRightsMechanisms>, deadline?: Partial<ConsumerRightsPolicy['deadline']> }

export interface ConsumerRightsPublicOptions {
  /** Default `/public/consumer-rights`. */
  path?: string
  /** An UNGUARDED parent only — whatever it guards, this subtree inherits. */
  parent?: RouteParent
  /**
   * Declare the two public frontend screens (sticky, like every legal page): the withdrawal
   * function and the cancellation page. Both or neither.
   */
  screens?: { withdrawal?: string, cancellation?: string, parent?: RouteParent }
}

export interface ConsumerRightsProtocolOptions {
  /** Alias prefix of every declaration, e.g. `my-app:account:consumer`. */
  prefix: string
  /** The application's guarded parent (its account base) — its guards and gate are inherited. */
  parent?: RouteParent
  /** Guards of a tree mounted without a parent. */
  guards?: EntrypointOptions['guards']
  gate?: EntrypointOptions['gate']
  /** Default `/consumer-rights`. */
  path?: string
  /** The unguarded public subtree; absent or `false` declares none. */
  public?: false | ConsumerRightsPublicOptions
}

/** The guarded account subtree: one entity's own purchases, consents and declarations. */
export interface ConsumerRightsAccountProtocols {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  profile: EntrypointProtocol<{}, BillingProfileView>
  purchases: EntrypointProtocol<{}, PurchaseList>
  consent: EntrypointProtocol<{}, PerformanceConsentView>
  giveConsent: EntrypointProtocol<{ body: PerformanceConsentBody }, PerformanceConsentResponse>
  start: EntrypointProtocol<{ query: SubscriptionStartQuery }, SubscriptionStartView>
  requestStart: EntrypointProtocol<{ body: SubscriptionStartBody }, SubscriptionStartResponse>
  withdrawals: EntrypointProtocol<{}, WithdrawalCandidateList>
  withdraw: EntrypointProtocol<{ body: WithdrawalBody }, WithdrawalReceipt>
  cancel: EntrypointProtocol<{ body: CancellationBody }, CancellationReceipt>
}

export interface ConsumerRightsScreens {
  withdrawal: EntrypointProtocol<OpenRequest, OpenValue>
  cancellation: EntrypointProtocol<OpenRequest, OpenValue>
}

/**
 * The unguarded public subtree: reachable WITHOUT a login (§ 312k BGB). Its receipts carry only
 * what was declared and when — never whether a contract matched.
 */
export interface ConsumerRightsPublicProtocols {
  base: EntrypointProtocol<OpenRequest, OpenValue>
  policy: EntrypointProtocol<{}, ConsumerRightsPublicView>
  withdraw: EntrypointProtocol<{ body: WithdrawalBody }, DeclarationReceipt>
  cancel: EntrypointProtocol<{ body: CancellationBody }, DeclarationReceipt>
}

/** The tree for given options — `public` (and its `screens`) present only when declared. */
export type ConsumerRightsProtocols<O extends ConsumerRightsProtocolOptions = ConsumerRightsProtocolOptions> =
  O['public'] extends ConsumerRightsPublicOptions
    ? ConsumerRightsAccountProtocols & { public: PublicOf<O['public']> }
    : ConsumerRightsAccountProtocols

export interface OneTimeRefundInput {
  paidMinor: number
  /** Already refunded (an earlier partial refund); the refund never exceeds the rest. */
  refundedMinor?: number
  unitsGranted: number
  /** Units used AFTER consent — before it, the consumer bears no cost. Clamped to `0..granted`. */
  unitsUsed: number
}

export interface OneTimeRefund {
  refundMinor: number
  /** The share of the purchase that is unused: `(granted − used) / granted`. */
  netRatio: number
  /** The unused units a withdrawal takes back. */
  unitsReturned: number
}

export interface SubscriptionRefundInput {
  paidMinor: number
  refundedMinor?: number
  /** The price net of tax — the base the components split and the deductions come from. */
  netMinor: number
  /** Absent or empty: the whole price is one `time` component. */
  components?: PlanWithdrawalComponent[]
  periodStart: Date
  periodEnd: Date
  /** When the consumer expressly requested the services. None: no time deduction at all. */
  servicesRequestedAt?: Date | null
  withdrawnAt: Date
  /** Units granted with the purchase and used after consent — applied to every `units` component. */
  units?: { granted: number, used: number } | null
}

export interface SubscriptionRefundComponent extends PlanWithdrawalComponent {
  /** The component's part of `netMinor`. */
  amountMinor: number
  deductionMinor: number
}

export interface SubscriptionRefund {
  /** Gross (tax-inclusive) refund, capped at what is still unrefunded. */
  refundMinor: number
  refundNetMinor: number
  timeDeductionMinor: number
  unitsDeductionMinor: number
  elapsedDays: number
  periodDays: number
  unitsUsed?: number
  unitsGranted?: number
  components: SubscriptionRefundComponent[]
}
