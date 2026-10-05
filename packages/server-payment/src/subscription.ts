import { ENTITLING_STATUSES, SubscriptionStatus } from '@owlmeans/payment'
import type { PaymentSubscriptionRecord, PropagatedState, SubscriptionChange, CommitOptions } from './types.js'
import { ENDED, MATERIAL } from './consts.local.js'
import { paymentUtils } from './utils.js'
import type { SubscriptionHelper } from './subscription/types.js'

export const createSubscriptionHelper = (): SubscriptionHelper => {
  const timeOf = (value: Date | null | undefined): number | null => value == null ? null : new Date(value).getTime()

  const propagatedStateOf = (
    record: PaymentSubscriptionRecord, renewedInvoiceId?: string,
  ): PropagatedState => paymentUtils.compact({
    planSku: record.planSku,
    rank: record.rank,
    status: record.status,
    cancelAtPeriodEnd: record.cancelAtPeriodEnd === true,
    pausedAt: record.pausedAt ?? undefined,
    renewedInvoiceId: renewedInvoiceId ?? undefined,
  })

  const classifySubscriptionChange = (
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

  const subscriptionEventKey = (
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

  const sameValue = (left: unknown, right: unknown): boolean => {
    if (left == null || right == null) {
      return left == null && right == null
    }
    if (left instanceof Date || right instanceof Date) {
      return timeOf(left as Date) === timeOf(right as Date)
    }

    return left === right
  }

  const materiallyDiffers = (previous: PaymentSubscriptionRecord, next: PaymentSubscriptionRecord): boolean =>
    MATERIAL.some(field => !sameValue(previous[field], next[field]))

  const stateDiffers = (state: PropagatedState, record: PaymentSubscriptionRecord): boolean =>
    state.planSku !== record.planSku || state.rank !== record.rank || state.status !== record.status
    || (state.cancelAtPeriodEnd === true) !== (record.cancelAtPeriodEnd === true)
    || timeOf(state.pausedAt) !== timeOf(record.pausedAt)

  return { propagatedStateOf, classifySubscriptionChange, subscriptionEventKey, materiallyDiffers, stateDiffers }
}

export const subscriptionHelper = createSubscriptionHelper()
