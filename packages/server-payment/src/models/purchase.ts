import { type PurchaseView, withdrawalDeadlineHelper } from '@owlmeans/payment'
import type { PurchaseRecord, PurchaseRef } from '../types.js'
import { paymentUtils } from '../utils.js'
import type { PurchaseModel } from './purchase/types.js'

export const makePurchaseModel = (record: PurchaseRecord): PurchaseModel => {
  const windowOpen = (at: Date = new Date()): boolean =>
    record.inScope && withdrawalDeadlineHelper.withdrawalOpen({
      deadline: record.deadline != null ? new Date(record.deadline) : null,
      withdrawnAt: record.withdrawnAt ?? null,
      refundedAt: record.refundedAt ?? null,
    }, at)

  const view = (withdrawable: boolean): PurchaseView => paymentUtils.compact({
    purchaseId: record.purchaseId,
    contractRef: record.contractRef,
    kind: record.kind,
    purchasedAt: new Date(record.purchasedAt),
    deadline: record.deadline != null ? new Date(record.deadline) : undefined,
    productSku: record.productSku,
    planSku: record.planSku ?? undefined,
    amountTotalMinor: record.amountTotalMinor,
    currency: record.currency,
    consentedAt: record.consentedAt != null ? new Date(record.consentedAt) : undefined,
    withdrawnAt: record.withdrawnAt != null ? new Date(record.withdrawnAt) : undefined,
    withdrawable,
  }) as PurchaseView

  const ref = (): PurchaseRef => paymentUtils.compact({
    purchaseId: record.purchaseId,
    kind: record.kind,
    entityId: record.entityId,
    contractRef: record.contractRef,
    productSku: record.productSku,
    planSku: record.planSku ?? undefined,
    sessionId: record.sessionId ?? undefined,
    subscriptionId: record.subscriptionId ?? undefined,
    invoiceId: record.invoiceId ?? undefined,
    purchasedAt: new Date(record.purchasedAt),
  }) as PurchaseRef

  return { record, windowOpen, view, ref }
}
