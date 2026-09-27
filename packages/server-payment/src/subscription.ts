import { ENTITLING_STATUSES, SubscriptionStatus } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { findPlan } from './plan.js'
import { compact, isDuplicateKey, observer, subscriptions } from './utils.js'
import type {
  PaymentSubscriptionRecord, PropagatedState, SubscriptionChange, SubscriptionSnapshot,
} from './types.js'

export interface CommitOptions {
  /** The paygate event being applied; a repeat of the last applied one is ignored. */
  eventId?: string
  /** A paid renewal invoice. */
  renewal?: boolean
  invoiceId?: string
  /** The paygate announced the trial ends soon. */
  trialEnding?: boolean
  /**
   * Runs after the new state is written and BEFORE observers hear the change — what must exist
   * before an observer grants anything (a subscription's purchase row). A throw propagates: the
   * observers are not told and the paygate retries.
   */
  beforePropagate?: (record: PaymentSubscriptionRecord, change: SubscriptionChange) => Promise<void>
}

export interface CommitResult {
  record: PaymentSubscriptionRecord | null
  change: SubscriptionChange | null
  /** The stored subscription state changed. */
  updated: boolean
}

const ENDED: readonly SubscriptionStatus[] = [SubscriptionStatus.Canceled, SubscriptionStatus.Ended]

const timeOf = (value: Date | null | undefined): number | null => value == null ? null : new Date(value).getTime()

/** The inputs classification compares. */
export const propagatedStateOf = (record: PaymentSubscriptionRecord, renewedInvoiceId?: string): PropagatedState => compact({
  planSku: record.planSku,
  rank: record.rank,
  status: record.status,
  cancelAtPeriodEnd: record.cancelAtPeriodEnd === true,
  pausedAt: record.pausedAt ?? undefined,
  renewedInvoiceId: renewedInvoiceId ?? undefined,
})

/**
 * What one subscription change means — the first rule that matches:
 * `created` (first entitling state ever propagated), `canceled`, `paused`, `resumed`,
 * `upgraded`/`downgraded` (plan change by rank; equal rank reads as an upgrade),
 * `cancel-scheduled`, `cancel-undone`, `renewed` (once per invoice), `past-due`, `suspended`,
 * `trial-ending`; otherwise nothing an observer is told about.
 */
export const classifySubscriptionChange = (
  previous: PropagatedState | null, current: PaymentSubscriptionRecord, opts: CommitOptions = {},
): SubscriptionChange | null => {
  const active = ENTITLING_STATUSES.includes(current.status)
  if (previous == null) {
    return active ? 'created' : null
  }
  if (ENDED.includes(current.status) && !ENDED.includes(previous.status)) {
    return 'canceled'
  }
  if (current.pausedAt != null && previous.pausedAt == null) {
    return 'paused'
  }
  if ((current.pausedAt == null && previous.pausedAt != null)
    || (previous.status === SubscriptionStatus.Suspended && active)) {
    return 'resumed'
  }
  if (current.planSku !== previous.planSku) {
    return current.rank < previous.rank ? 'downgraded' : 'upgraded'
  }
  if (previous.cancelAtPeriodEnd !== true && current.cancelAtPeriodEnd === true) {
    return 'cancel-scheduled'
  }
  if (previous.cancelAtPeriodEnd === true && current.cancelAtPeriodEnd !== true) {
    return 'cancel-undone'
  }
  if (opts.renewal === true && opts.invoiceId != null && opts.invoiceId !== previous.renewedInvoiceId) {
    return 'renewed'
  }
  if (current.status === SubscriptionStatus.PastDue && previous.status !== SubscriptionStatus.PastDue) {
    return 'past-due'
  }
  if (current.status === SubscriptionStatus.Suspended && previous.status !== SubscriptionStatus.Suspended) {
    return 'suspended'
  }
  if (opts.trialEnding === true) {
    return 'trial-ending'
  }

  return null
}

/** The idempotency key a consumer keys the side effect of a change by. */
export const subscriptionEventKey = (
  record: PaymentSubscriptionRecord, change: SubscriptionChange, opts: CommitOptions = {},
): string => {
  const base = `subscription:${record.externalId}:${change}`
  switch (change) {
    case 'created':
      return `${base}:${new Date(record.createdAt).toISOString()}`
    case 'renewed':
      return `${base}:${opts.invoiceId ?? record.latestInvoiceId ?? 'unknown'}`
    case 'upgraded':
    case 'downgraded':
      return `${base}:${record.planSku}`
    case 'trial-ending':
      return `${base}:${record.trialEnd != null ? new Date(record.trialEnd).toISOString() : 'unknown'}`
    default:
      return `${base}:${opts.eventId ?? `sync-${new Date(record.updatedAt ?? Date.now()).toISOString()}`}`
  }
}

/** A subscription as observers see it; `state` overlays what was last propagated. */
export const snapshotOf = async (
  ctx: ApiContext, record: PaymentSubscriptionRecord, state?: PropagatedState,
): Promise<SubscriptionSnapshot> => {
  const planSku = state?.planSku ?? record.planSku
  const plan = await findPlan(ctx, planSku)

  return compact<SubscriptionSnapshot>({
    entityId: record.entityId,
    planSku,
    productSku: plan?.productSku ?? record.productSku,
    rank: state?.rank ?? record.rank,
    status: state?.status ?? record.status,
    paygate: record.paygate,
    subscriptionId: record.externalId,
    service: record.service,
    periodStart: record.periodStart ?? undefined,
    periodEnd: record.periodEnd ?? undefined,
    cancelAtPeriodEnd: state != null ? state.cancelAtPeriodEnd : record.cancelAtPeriodEnd ?? undefined,
    trialEnd: record.trialEnd ?? undefined,
    pausedAt: state != null ? state.pausedAt : record.pausedAt ?? undefined,
    createdAt: record.createdAt ?? undefined,
    capabilities: plan?.capabilities,
    limits: plan?.limits,
  })
}

const MATERIAL: Array<keyof PaymentSubscriptionRecord> = [
  'entityId', 'planSku', 'productSku', 'service', 'itemId', 'priceId', 'status', 'externalStatus', 'rank',
  'periodStart', 'periodEnd', 'cancelAtPeriodEnd', 'canceledAt', 'endedAt', 'pausedAt', 'trialEnd',
  'latestInvoiceId', 'customerId',
]

const sameValue = (left: unknown, right: unknown): boolean => {
  if (left == null || right == null) {
    return left == null && right == null
  }
  if (left instanceof Date || right instanceof Date) {
    return timeOf(left as Date) === timeOf(right as Date)
  }

  return left === right
}

export const materiallyDiffers = (previous: PaymentSubscriptionRecord, next: PaymentSubscriptionRecord): boolean =>
  MATERIAL.some(field => !sameValue(previous[field], next[field]))

/**
 * Store a subscription's new state, tell observers what changed, then record what was told.
 *
 * The state is written BEFORE observers run, so an observer reading entitlements sees the new plan.
 * What classification compares against is the state last PROPAGATED (`propagated`), stamped only
 * after every observer succeeded — so an observer that throws leaves the change to be classified
 * again, identically, when the paygate retries. `lastEventId` is stamped with it.
 */
export const commitSubscription = async (
  ctx: ApiContext, previous: PaymentSubscriptionRecord | null, next: PaymentSubscriptionRecord,
  opts: CommitOptions = {},
): Promise<CommitResult> => {
  const resource = subscriptions(ctx)
  const updated = previous == null || materiallyDiffers(previous, next)
  const prior = previous?.propagated ?? null
  const change = classifySubscriptionChange(prior, next, opts)
  const at = new Date()

  const finalize = (record: PaymentSubscriptionRecord): PaymentSubscriptionRecord => {
    const tracked = prior != null || change === 'created'
    return {
      ...record,
      ...(opts.eventId != null ? { lastEventId: opts.eventId } : {}),
      ...(tracked ? {
        propagated: propagatedStateOf(record, change === 'renewed' ? opts.invoiceId : prior?.renewedInvoiceId),
      } : {}),
      ...(change === 'created' && record.initialPropagatedAt == null ? { initialPropagatedAt: at } : {}),
    }
  }

  const write = async (record: PaymentSubscriptionRecord): Promise<PaymentSubscriptionRecord> => {
    if (record.id != null) {
      return await resource.update(record)
    }
    try {
      return await resource.create(record)
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error
      }
      const winner = await resource.byExternalId(record.externalId, record.paygate)
      return await resource.update({ ...record, id: winner?.id })
    }
  }

  if (change == null) {
    const quiet = previous != null && !updated && (opts.eventId == null || previous.lastEventId === opts.eventId)
      && (prior == null || !stateDiffers(prior, next))
    return { record: quiet ? previous : await write(finalize(next)), change: null, updated }
  }

  const stored = await write(next)
  await opts.beforePropagate?.(stored, change)
  await observer(ctx).propagateSubscription({
    change,
    previous: prior != null && previous != null ? await snapshotOf(ctx, previous, prior) : null,
    current: await snapshotOf(ctx, stored),
    active: ENTITLING_STATUSES.includes(stored.status),
    eventKey: subscriptionEventKey(stored, change, opts),
    ...(opts.invoiceId != null ? { invoiceId: opts.invoiceId } : {}),
    ...(opts.eventId != null ? { externalEventId: opts.eventId } : {}),
  }, ctx)

  return { record: await resource.update(finalize(stored)), change, updated }
}

const stateDiffers = (state: PropagatedState, record: PaymentSubscriptionRecord): boolean =>
  state.planSku !== record.planSku || state.rank !== record.rank || state.status !== record.status
  || (state.cancelAtPeriodEnd === true) !== (record.cancelAtPeriodEnd === true)
  || timeOf(state.pausedAt) !== timeOf(record.pausedAt)
