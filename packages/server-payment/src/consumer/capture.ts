import { ConsentKind, CONSUMER_RIGHTS_COPY_VERSION, PurchaseKind, type ConsumerRightsPolicy, consumerRegionHelper, withdrawalDeadlineHelper } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type { CheckoutSnapshot, Paygate, PaygateSubscription } from '../paygate/types.js'
import type { PurchaseDraft, CapturedPurchase, InvoiceEvidence, SessionEvidence } from './types.js'
import type {
  BillingProfileRecord, PaymentSubscriptionRecord, PurchaseRecord, ConsumerConsentRecord,
} from '../types.js'
import { log } from '../log.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { consumerRecordsOf } from './records.js'
import type { CapturedPaymentExtra, CaptureHelper } from './capture/types.js'
import { consumerMailOf } from './mail.js'

const deadlineOf = (policy: ConsumerRightsPolicy, scoped: boolean, purchasedAt: Date): Date | undefined =>
  scoped ? withdrawalDeadlineHelper.withdrawalDeadlineOf(purchasedAt, policy) : undefined

export const makeCaptureHelper = (ctx: ApiContext): CaptureHelper => {
  const access = paymentAccessOf(ctx)
  const records = consumerRecordsOf(ctx)

  const sessionEvidenceOf = (session: CheckoutSnapshot): SessionEvidence => {
    const subtotal = session.amountSubtotalMinor ?? 0
    const tax = session.amountTaxMinor ?? 0

    return paymentUtils.compact({
      country: session.buyer.country?.toUpperCase() ?? undefined,
      email: session.buyer.email ?? undefined,
      name: session.buyer.name ?? undefined,
      business: session.buyer.business === true ? true : undefined,
      currency: (session.currency ?? '').toLowerCase(),
      subtotalMinor: subtotal,
      taxMinor: tax,
      totalMinor: session.amountTotalMinor ?? subtotal + tax,
      presentmentCurrency: session.presentment?.currency?.toLowerCase(),
      presentmentAmountMinor: session.presentment?.amountMinor,
      termsAccepted: session.termsAccepted,
    }) as SessionEvidence
  }

  const invoiceEvidenceOf = async (paygate: Paygate | null | undefined, invoiceId: string | undefined): Promise<InvoiceEvidence> => {
    if (paygate?.payments == null || invoiceId == null) {
      return {}
    }
    try {
      const invoice = await paygate.payments.invoice(invoiceId)
      if (invoice == null) {
        return {}
      }

      return paymentUtils.compact({
        invoiceNumber: invoice.number ?? undefined,
        invoiceLineId: invoice.firstLineId,
        paymentIntentId: invoice.paymentId,
        country: invoice.country?.toUpperCase() ?? undefined,
        subtotalMinor: invoice.subtotalMinor ?? undefined,
        taxMinor: invoice.taxMinor ?? undefined,
        totalMinor: invoice.totalMinor ?? undefined,
        currency: invoice.currency ?? undefined,
      }) as InvoiceEvidence
    } catch (error) {
      log.warn('Invoice unreadable for its purchase', { invoiceId, error })
      return {}
    }
  }

  /**
   * Lock the entity's billing country from a completed checkout, when the policy locks countries: the
   * buyer's address at the paygate, else the declared country — the pinned one first when the session
   * held it (`countryPinned`: tax was calculated on it, the card form's country moved nothing).
   */
  const lockFromSession = async (
    paygate: Paygate, policy: ConsumerRightsPolicy, entityId: string, session: CheckoutSnapshot,
    evidence: SessionEvidence,
  ): Promise<BillingProfileRecord | null> => {
    const metadata = session.metadata ?? {}
    const country = metadata.countryPinned === 'true'
      ? metadata.country ?? evidence.country
      : evidence.country ?? metadata.country
    if (!policy.mechanisms.countryLock || country == null || country === '') {
      return null
    }
    const { record } = await records.lockProfile(policy, {
      entityId, country, source: 'checkout', paygate: paygate.id, customerId: session.customerId, sessionId: session.id,
      ipCountry: metadata.ipCountry, email: evidence.email, name: evidence.name, business: evidence.business,
      currency: evidence.currency, language: metadata.language,
    })

    return record
  }

  /**
   * Mail the purchase confirmation once per purchase: only the delivery that claims the purchase's
   * `confirmationMailAt` (a conditional write — concurrent deliveries in several processes, a
   * redelivery, the checkout refining a subscription) sends it; one that failed is retried by
   * `reconcile`, never here. A purchase mailed before the claim existed is recognised by its event.
   */
  const confirmPurchase = async (policy: ConsumerRightsPolicy, purchase: PurchaseRecord): Promise<void> => {
    if (!policy.mechanisms.purchaseConfirmation || !purchase.inScope) {
      return
    }
    if (await records.hasEvent(purchase.purchaseId, 'mail', 'purchase')) {
      return
    }
    const claimed = await paymentUtils.conditionalSet(access.purchases(), { purchaseId: purchase.purchaseId, confirmationMailAt: null }, {
      confirmationMailAt: new Date(),
    })
    if (!claimed) {
      return
    }
    await consumerMailOf(ctx).sendConsumerMail(policy, 'purchase', purchase.purchaseId)
  }

  const capturePaymentPurchase = async (
    paygate: Paygate, session: CheckoutSnapshot, extra: CapturedPaymentExtra = {}, opts: { mail?: boolean } = {},
  ): Promise<CapturedPurchase | null> => {
    const policy = await access.payment().consumerRightsPolicy()
    if (policy == null) {
      return null
    }
    const metadata = session.metadata ?? {}
    const entityId = metadata.entityId
    if (entityId == null || metadata.productSku == null) {
      return null
    }
    const evidence = sessionEvidenceOf(session)
    const profile = await lockFromSession(paygate, policy, entityId, session, evidence)
    const existing = await access.purchases().byPurchaseId(records.purchaseIdOf(paygate.id, session.id))
    if (existing != null) {
      if (opts.mail !== false) await confirmPurchase(policy, existing)
      return { purchase: existing, created: false }
    }

    const country = evidence.country ?? metadata.country ?? profile?.country
    const region = consumerRegionHelper.regionOf(country, policy)
    // Protected when either the buyer's own address or the organization's locked country is in scope.
    const scoped = consumerRegionHelper.inScope(region, country, policy) || (profile != null && consumerRegionHelper.inScope(profile.region, profile.country, policy))
    const invoice = await invoiceEvidenceOf(paygate, session.invoiceId)
    const purchasedAt = extra.at ?? new Date()
    const draft = paymentUtils.compact({
      purchaseId: records.purchaseIdOf(paygate.id, session.id),
      entityId,
      kind: PurchaseKind.TopUp,
      paygate: paygate.id,
      sessionId: session.id,
      paymentIntentId: session.paymentId ?? invoice.paymentIntentId,
      invoiceId: session.invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceLineId: invoice.invoiceLineId,
      productSku: metadata.productSku,
      planSku: metadata.planSku,
      profileId: metadata.profileId,
      country,
      region: region ?? undefined,
      ipCountry: metadata.ipCountry,
      inScope: scoped,
      language: profile?.language ?? metadata.language ?? consumerRegionHelper.billingLanguageOf(country, policy),
      email: evidence.email,
      name: evidence.name,
      business: evidence.business,
      currency: evidence.currency,
      amountSubtotalMinor: evidence.subtotalMinor,
      amountTaxMinor: evidence.taxMinor,
      amountTotalMinor: evidence.totalMinor,
      presentmentCurrency: evidence.presentmentCurrency,
      presentmentAmountMinor: evidence.presentmentAmountMinor,
      netAmountMinor: extra.netAmountMinor,
      amountCurrency: extra.amountCurrency,
      units: extra.units,
      taxBehavior: extra.taxBehavior,
      termsAccepted: evidence.termsAccepted,
      textVersion: metadata.termsVersion ?? policy.textVersion,
      copyVersion: metadata.copyVersion ?? CONSUMER_RIGHTS_COPY_VERSION,
      purchasedAt,
      // Free redemptions retain their receipt but have no monetary withdrawal or consent window.
      deadline: evidence.totalMinor === 0 ? undefined : deadlineOf(policy, scoped, purchasedAt),
    }) as PurchaseDraft
    const { record, created } = await records.createPurchase(draft)
    if (opts.mail !== false) await confirmPurchase(policy, record)

    return { purchase: record, created }
  }

  /** The start request a subscription's metadata names, when it is a real start request of that entity. */
  const startRequestOf = async (entityId: string, id: string | undefined): Promise<ConsumerConsentRecord | null> => {
    if (id == null || id === '') {
      return null
    }
    const consent = await access.consumerConsents().load(id).catch(() => null)

    return consent != null && consent.kind === ConsentKind.SubscriptionStart && consent.entityId === entityId ? consent : null
  }

  const captureSubscriptionPurchase = async (
    paygate: Paygate, subscription: PaygateSubscription, row: PaymentSubscriptionRecord,
  ): Promise<CapturedPurchase | null> => {
    const policy = await access.payment().consumerRightsPolicy()
    if (policy == null) {
      return null
    }
    const purchaseId = records.purchaseIdOf(paygate.id, subscription.id)
    const existing = await access.purchases().byPurchaseId(purchaseId)
    if (existing != null) {
      return { purchase: existing, created: false }
    }
    const metadata = subscription.metadata ?? {}
    const invoiceId = subscription.latestInvoiceId
    const invoice = await invoiceEvidenceOf(paygate, invoiceId)
    const profile = await access.billingProfiles().byEntity(row.entityId)
    const country = invoice.country ?? profile?.country ?? metadata.country
    const region = consumerRegionHelper.regionOf(country, policy)
    const scoped = consumerRegionHelper.inScope(region, country, policy) || (profile != null && consumerRegionHelper.inScope(profile.region, profile.country, policy))
    const start = await startRequestOf(row.entityId, metadata.startRequestId)
    const subtotal = invoice.subtotalMinor ?? (subscription.unitAmountMinor ?? 0) * (subscription.quantity ?? 1)
    const tax = invoice.taxMinor ?? 0
    const purchasedAt = subscription.createdAt ?? new Date()
    const draft = paymentUtils.compact({
      purchaseId,
      entityId: row.entityId,
      kind: PurchaseKind.Subscription,
      paygate: paygate.id,
      subscriptionId: subscription.id,
      paymentIntentId: invoice.paymentIntentId,
      invoiceId,
      invoiceNumber: invoice.invoiceNumber,
      invoiceLineId: invoice.invoiceLineId,
      productSku: row.productSku,
      planSku: row.planSku,
      profileId: metadata.profileId,
      country,
      region: region ?? undefined,
      ipCountry: metadata.ipCountry,
      inScope: scoped,
      language: profile?.language ?? metadata.language ?? consumerRegionHelper.billingLanguageOf(country, policy),
      currency: (invoice.currency ?? subscription.currency ?? subscription.priceCurrency ?? 'usd').toLowerCase(),
      amountSubtotalMinor: subtotal,
      amountTaxMinor: tax,
      amountTotalMinor: invoice.totalMinor ?? subtotal + tax,
      taxBehavior: subscription.taxBehavior ?? undefined,
      textVersion: metadata.termsVersion ?? policy.textVersion,
      copyVersion: metadata.copyVersion ?? CONSUMER_RIGHTS_COPY_VERSION,
      startRequestId: start?.id,
      servicesStartedAt: start?.decidedAt,
      consentId: start?.id,
      consentedAt: start?.decidedAt,
      purchasedAt,
      deadline: deadlineOf(policy, scoped, purchasedAt),
    }) as PurchaseDraft
    const { record, created } = await records.createPurchase(draft)

    return { purchase: record, created }
  }

  const completeSubscriptionPurchase = async (
    paygate: Paygate, session: CheckoutSnapshot, purchase: PurchaseRecord,
    opts: { mail?: boolean } = {},
  ): Promise<PurchaseRecord> => {
    const policy = await access.payment().consumerRightsPolicy()
    if (policy == null) {
      return purchase
    }
    const evidence = sessionEvidenceOf(session)
    const profile = await lockFromSession(paygate, policy, purchase.entityId, session, evidence)
    const country = evidence.country ?? purchase.country ?? profile?.country
    const region = consumerRegionHelper.regionOf(country, policy)
    const scoped = consumerRegionHelper.inScope(region, country, policy) || (profile != null && consumerRegionHelper.inScope(profile.region, profile.country, policy))
    const invoice = purchase.invoiceLineId == null || purchase.paymentIntentId == null
      ? await invoiceEvidenceOf(paygate, purchase.invoiceId ?? session.invoiceId) : {}
    const purchasedAt = new Date(purchase.purchasedAt)
    const fields = paymentUtils.compact({
      sessionId: session.id,
      invoiceId: purchase.invoiceId ?? session.invoiceId,
      invoiceNumber: purchase.invoiceNumber ?? invoice.invoiceNumber,
      invoiceLineId: purchase.invoiceLineId ?? invoice.invoiceLineId,
      paymentIntentId: purchase.paymentIntentId ?? invoice.paymentIntentId,
      country,
      region: region ?? undefined,
      inScope: scoped,
      deadline: scoped ? purchase.deadline ?? withdrawalDeadlineHelper.withdrawalDeadlineOf(purchasedAt, policy) : undefined,
      email: evidence.email ?? purchase.email,
      name: evidence.name ?? purchase.name,
      business: evidence.business ?? purchase.business,
      currency: evidence.currency !== '' ? evidence.currency : purchase.currency,
      amountSubtotalMinor: evidence.subtotalMinor,
      amountTaxMinor: evidence.taxMinor,
      amountTotalMinor: evidence.totalMinor,
      presentmentCurrency: evidence.presentmentCurrency,
      presentmentAmountMinor: evidence.presentmentAmountMinor,
      termsAccepted: evidence.termsAccepted,
      ipCountry: purchase.ipCountry ?? session.metadata?.ipCountry,
      language: profile?.language ?? purchase.language,
    }) as Partial<PurchaseRecord>
    await records.patchPurchase(purchase.purchaseId, fields)
    const updated = { ...purchase, ...fields } as PurchaseRecord
    if (!scoped && purchase.deadline != null) {
      // Out of scope after all (the buyer's own country): no window.
      await records.patchPurchase(purchase.purchaseId, { deadline: null as unknown as undefined })
      delete updated.deadline
    }
    if (opts.mail !== false) await confirmPurchase(policy, updated)

    return updated
  }

  return {
    sessionEvidenceOf, invoiceEvidenceOf, capturePaymentPurchase, captureSubscriptionPurchase,
    completeSubscriptionPurchase,
  }
}

/** The purchase capture of a context — one per context. */
export const captureOf = memoHelper.oncePer(makeCaptureHelper)
