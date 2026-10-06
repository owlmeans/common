import { ENTITLING_STATUSES, INTERNAL_PAYGATE, ProductError, SubscriptionStatus, UnknownPlan } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type {
  CommitOptions, CommitResult, GrantInternalPlanOptions, PaymentSubscriptionRecord, PropagatedState,
  SubscriptionSnapshot,
} from './types.js'
import { log } from './log.js'
import { SUBSCRIPTION_LOG_EVENTS } from './consts.local.js'
import { paymentAccessOf } from './access.js'
import { paymentUtils } from './utils.js'
import { catalogueOf } from './catalogue.js'
import { planHelper } from './plan.js'
import { subscriptionHelper } from './subscription.js'
import type { SubscriptionCommitHelper } from './commit/types.js'

export const makeSubscriptionCommitHelper = (ctx: ApiContext): SubscriptionCommitHelper => {
  const access = paymentAccessOf(ctx)

  const snapshotOf = async (
    record: PaymentSubscriptionRecord, state?: PropagatedState,
  ): Promise<SubscriptionSnapshot> => {
    const planSku = state?.planSku ?? record.planSku
    const declared = await catalogueOf(ctx).findPlan(planSku)
    const plan = declared != null ? planHelper.overriddenPlan(declared, record) : null

    return paymentUtils.compact<SubscriptionSnapshot>({
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

  const commitSubscription = async (
    previous: PaymentSubscriptionRecord | null, next: PaymentSubscriptionRecord, opts: CommitOptions = {},
  ): Promise<CommitResult> => {
    const resource = access.subscriptions()
    const updated = previous == null || subscriptionHelper.materiallyDiffers(previous, next)
    const prior = previous?.propagated ?? null
    const change = subscriptionHelper.classifySubscriptionChange(prior, next, opts)
    const at = new Date()

    const finalize = (record: PaymentSubscriptionRecord): PaymentSubscriptionRecord => {
      const tracked = prior != null || change === 'created'
      return {
        ...record,
        ...(opts.eventId != null ? { lastEventId: opts.eventId } : {}),
        ...(tracked ? {
          propagated: subscriptionHelper.propagatedStateOf(
            record, change === 'renewed' ? opts.invoiceId : prior?.renewedInvoiceId,
          ),
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
        if (!paymentUtils.isDuplicateKey(error)) {
          throw error
        }
        const winner = await resource.byExternalId(record.externalId, record.paygate)
        return await resource.update({ ...record, id: winner?.id })
      }
    }

    if (change == null) {
      const quiet = previous != null && !updated && (opts.eventId == null || previous.lastEventId === opts.eventId)
        && (prior == null || !subscriptionHelper.stateDiffers(prior, next))
      return { record: quiet ? previous : await write(finalize(next)), change: null, updated }
    }

    const stored = await write(next)
    await opts.beforePropagate?.(stored, change)
    await access.observer().propagateSubscription({
      change,
      previous: prior != null && previous != null ? await snapshotOf(previous, prior) : null,
      current: await snapshotOf(stored),
      active: ENTITLING_STATUSES.includes(stored.status),
      eventKey: subscriptionHelper.subscriptionEventKey(stored, change, opts),
      ...(opts.invoiceId != null ? { invoiceId: opts.invoiceId } : {}),
      ...(opts.eventId != null ? { externalEventId: opts.eventId } : {}),
    }, ctx)

    const record = await resource.update(finalize(stored))
    log.info('Subscription changed', paymentUtils.compact({
      entityId: stored.entityId, subscriptionId: stored.externalId, change, planSku: stored.planSku,
      previousPlanSku: prior != null && prior.planSku !== stored.planSku ? prior.planSku : undefined,
      status: stored.status, currency: stored.currency ?? undefined, invoiceId: opts.invoiceId, eventId: opts.eventId,
    }), { event: SUBSCRIPTION_LOG_EVENTS[change] ?? 'subscription.updated' })

    return { record, change, updated }
  }

  const grantInternalPlan = async (
    entityId: string, planSku: string, opts: GrantInternalPlanOptions = {},
  ): Promise<PaymentSubscriptionRecord> => {
    const plan = await catalogueOf(ctx).findPlan(planSku)
    if (plan == null) {
      throw new UnknownPlan(planSku)
    }
    if (plan.free !== true && opts.force !== true) {
      throw new ProductError(`internal-grant:${planSku}`)
    }
    const product = await catalogueOf(ctx).findProduct(plan.productSku)
    const externalId = plan.free === true ? `free:${entityId}` : `internal:${planSku}:${entityId}`
    const previous = await access.subscriptions().byExternalId(externalId, INTERNAL_PAYGATE)
    const now = new Date()
    const { periodEnd: _periodEnd, endedAt: _endedAt, canceledAt: _canceledAt, ...kept } = previous ?? {}

    const next = {
      ...kept,
      entityId,
      planSku,
      productSku: plan.productSku,
      service: previous?.service ?? product?.services?.[0] ?? ctx.cfg.service,
      paygate: INTERNAL_PAYGATE,
      externalId,
      status: SubscriptionStatus.Active,
      rank: planHelper.planRank(plan),
      ...(opts.periodEnd != null ? { periodEnd: opts.periodEnd } : {}),
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    } as PaymentSubscriptionRecord
    const { record } = await commitSubscription(previous, next)

    return record ?? next
  }

  return { snapshotOf, commitSubscription, grantInternalPlan }
}

/** The subscription store of a context — one per context. */
export const subscriptionCommitOf = memoHelper.oncePer(makeSubscriptionCommitHelper)
