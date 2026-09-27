import type Stripe from 'stripe'
import {
  billingLanguageOf, ConsentKind, CONSUMER_RIGHTS_COPY_VERSION, inScope, PurchaseKind, regionOf,
  withdrawalDeadlineOf,
} from '@owlmeans/payment'
import type { ConsumerRightsPolicy } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { STRIPE_PAYGATE_ALIAS } from '../consts.js'
import {
  billingProfiles, compact, conditionalSet, consumerConsents, dateOf, idOf, isMissingObject, payment, purchases,
} from '../utils.js'
import { sendConsumerMail } from './mail.js'
import {
  createPurchase, hasEvent, lockProfile, patchPurchase, purchaseIdOf,
} from './records.js'
import type { PurchaseDraft } from './records.js'
import type { BillingProfileRecord, PaymentSubscriptionRecord, PurchaseRecord } from '../types.js'

/** What a completed Checkout Session says about its buyer and totals. */
export interface SessionEvidence {
  country?: string
  email?: string
  name?: string
  business?: boolean
  currency: string
  subtotalMinor: number
  taxMinor: number
  totalMinor: number
  presentmentCurrency?: string
  presentmentAmountMinor?: number
  termsAccepted?: boolean
}

/**
 * The buyer and totals of a Checkout Session. `presentment_details` (Adaptive Pricing) is not typed
 * by the pinned SDK, hence the narrow accessor.
 */
export const sessionEvidenceOf = (session: Stripe.Checkout.Session): SessionEvidence => {
  const details = session.customer_details
  const presentment = (session as unknown as {
    presentment_details?: { presentment_amount?: number, presentment_currency?: string } | null
  }).presentment_details
  const subtotal = session.amount_subtotal ?? 0
  const tax = session.total_details?.amount_tax ?? 0

  return compact({
    country: details?.address?.country?.toUpperCase() ?? undefined,
    email: details?.email ?? undefined,
    name: details?.name ?? undefined,
    business: (details?.tax_ids?.length ?? 0) > 0 || details?.tax_exempt === 'reverse' ? true : undefined,
    currency: (session.currency ?? '').toLowerCase(),
    subtotalMinor: subtotal,
    taxMinor: tax,
    totalMinor: session.amount_total ?? subtotal + tax,
    presentmentCurrency: presentment?.presentment_currency?.toLowerCase(),
    presentmentAmountMinor: presentment?.presentment_amount,
    termsAccepted: session.consent?.terms_of_service === 'accepted' ? true
      : session.consent?.terms_of_service != null ? false : undefined,
  }) as SessionEvidence
}

/** What an invoice adds to a purchase: its number, its line and the payment behind it. */
export interface InvoiceEvidence {
  invoiceNumber?: string
  invoiceLineId?: string
  paymentIntentId?: string
  country?: string
  subtotalMinor?: number
  taxMinor?: number
  totalMinor?: number
  currency?: string
}

/**
 * An invoice's evidence, best effort: an unreachable invoice is logged and yields nothing — the
 * withdrawal reads it again when it needs it. `invoice.payment_intent` is top-level on the pinned
 * API version.
 */
export const invoiceEvidenceOf = async (stripe: Stripe | null | undefined, invoiceId: string | undefined): Promise<InvoiceEvidence> => {
  if (stripe == null || invoiceId == null) {
    return {}
  }
  try {
    const invoice = await stripe.invoices.retrieve(invoiceId)
    const typed = invoice as unknown as { payment_intent?: string | { id?: string } | null, tax?: number | null }

    return compact({
      invoiceNumber: invoice.number ?? undefined,
      invoiceLineId: invoice.lines?.data?.[0]?.id,
      paymentIntentId: idOf(typed.payment_intent),
      country: invoice.customer_address?.country?.toUpperCase() ?? undefined,
      subtotalMinor: invoice.subtotal ?? undefined,
      taxMinor: typed.tax ?? undefined,
      totalMinor: invoice.total ?? undefined,
      currency: invoice.currency ?? undefined,
    }) as InvoiceEvidence
  } catch (error) {
    if (!isMissingObject(error)) {
      console.warn(`[payment] invoice "${invoiceId}" unreadable for its purchase`, error)
    }
    return {}
  }
}

const deadlineOf = (policy: ConsumerRightsPolicy, scoped: boolean, purchasedAt: Date): Date | undefined =>
  scoped ? withdrawalDeadlineOf(purchasedAt, policy) : undefined

/** Lock the entity's billing country from a completed checkout, when the policy locks countries. */
const lockFromSession = async (
  ctx: ApiContext, policy: ConsumerRightsPolicy, entityId: string, session: Stripe.Checkout.Session,
  evidence: SessionEvidence,
): Promise<BillingProfileRecord | null> => {
  const metadata = session.metadata ?? {}
  const country = evidence.country ?? metadata.country
  if (!policy.mechanisms.countryLock || country == null || country === '') {
    return null
  }
  const { record } = await lockProfile(ctx, policy, {
    entityId, country, source: 'checkout', customerId: idOf(session.customer), sessionId: session.id,
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
const confirmPurchase = async (ctx: ApiContext, policy: ConsumerRightsPolicy, purchase: PurchaseRecord): Promise<void> => {
  if (!policy.mechanisms.purchaseConfirmation || !purchase.inScope) {
    return
  }
  if (await hasEvent(ctx, purchase.purchaseId, 'mail', 'purchase')) {
    return
  }
  const claimed = await conditionalSet(purchases(ctx), { purchaseId: purchase.purchaseId, confirmationMailAt: null }, {
    confirmationMailAt: new Date(),
  })
  if (!claimed) {
    return
  }
  await sendConsumerMail(ctx, policy, 'purchase', purchase.purchaseId)
}

export interface CapturedPurchase {
  purchase: PurchaseRecord
  created: boolean
}

/**
 * A completed, paid ONE-TIME checkout as a purchase — the window and the contract registry. Runs
 * BEFORE the credits are granted: the billing country is locked first (first write wins; another
 * country is a `lock-mismatch` event), then the purchase row is written, then its confirmation is
 * mailed. `null` when no consumer-rights policy is declared.
 */
export const capturePaymentPurchase = async (
  ctx: ApiContext, stripe: Stripe | null, session: Stripe.Checkout.Session,
  extra: { netAmountMinor?: number, amountCurrency?: string, units?: number, taxBehavior?: string, at?: Date } = {},
  opts: { mail?: boolean } = {},
): Promise<CapturedPurchase | null> => {
  const policy = await payment(ctx).consumerRightsPolicy()
  if (policy == null) {
    return null
  }
  const metadata = session.metadata ?? {}
  const entityId = metadata.entityId
  if (entityId == null || metadata.productSku == null) {
    return null
  }
  const evidence = sessionEvidenceOf(session)
  const profile = await lockFromSession(ctx, policy, entityId, session, evidence)
  const existing = await purchases(ctx).byPurchaseId(purchaseIdOf(session.id))
  if (existing != null) {
    if (opts.mail !== false) await confirmPurchase(ctx, policy, existing)
    return { purchase: existing, created: false }
  }

  const country = evidence.country ?? metadata.country ?? profile?.country
  const region = regionOf(country, policy)
  // Protected when either the buyer's own address or the organization's locked country is in scope.
  const scoped = inScope(region, country, policy) || (profile != null && inScope(profile.region, profile.country, policy))
  const invoice = await invoiceEvidenceOf(stripe, idOf(session.invoice))
  const purchasedAt = extra.at ?? new Date()
  const draft = compact({
    purchaseId: purchaseIdOf(session.id),
    entityId,
    kind: PurchaseKind.TopUp,
    paygate: STRIPE_PAYGATE_ALIAS,
    sessionId: session.id,
    paymentIntentId: idOf(session.payment_intent) ?? invoice.paymentIntentId,
    invoiceId: idOf(session.invoice),
    invoiceNumber: invoice.invoiceNumber,
    invoiceLineId: invoice.invoiceLineId,
    productSku: metadata.productSku,
    planSku: metadata.planSku,
    profileId: metadata.profileId,
    country,
    region: region ?? undefined,
    ipCountry: metadata.ipCountry,
    inScope: scoped,
    language: profile?.language ?? metadata.language ?? billingLanguageOf(country, policy),
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
    deadline: deadlineOf(policy, scoped, purchasedAt),
  }) as PurchaseDraft
  const { record, created } = await createPurchase(ctx, draft)
  if (opts.mail !== false) await confirmPurchase(ctx, policy, record)

  return { purchase: record, created }
}

/** The start request a subscription's metadata names, when it is a real start request of that entity. */
const startRequestOf = async (ctx: ApiContext, entityId: string, id: string | undefined) => {
  if (id == null || id === '') {
    return null
  }
  const consent = await consumerConsents(ctx).load(id).catch(() => null)

  return consent != null && consent.kind === ConsentKind.SubscriptionStart && consent.entityId === entityId ? consent : null
}

/**
 * A subscription's FIRST invoice as a purchase — called while the subscription is committed, BEFORE
 * the `created` observers grant anything, so the window exists before the bundle can be spent. The
 * buyer's country and totals are refined when the checkout completes. The start request (when the
 * metadata names one) is the purchase's consent: `servicesStartedAt` and `consentedAt`.
 */
export const captureSubscriptionPurchase = async (
  ctx: ApiContext, stripe: Stripe | null, subscription: Stripe.Subscription, row: PaymentSubscriptionRecord,
): Promise<CapturedPurchase | null> => {
  const policy = await payment(ctx).consumerRightsPolicy()
  if (policy == null) {
    return null
  }
  const purchaseId = purchaseIdOf(subscription.id)
  const existing = await purchases(ctx).byPurchaseId(purchaseId)
  if (existing != null) {
    return { purchase: existing, created: false }
  }
  const metadata = subscription.metadata ?? {}
  const item = subscription.items?.data?.[0]
  const invoiceId = idOf(subscription.latest_invoice)
  const invoice = await invoiceEvidenceOf(stripe, invoiceId)
  const profile = await billingProfiles(ctx).byEntity(row.entityId)
  const country = invoice.country ?? profile?.country ?? metadata.country
  const region = regionOf(country, policy)
  const scoped = inScope(region, country, policy) || (profile != null && inScope(profile.region, profile.country, policy))
  const start = await startRequestOf(ctx, row.entityId, metadata.startRequestId)
  const subtotal = invoice.subtotalMinor ?? (item?.price?.unit_amount ?? 0) * (item?.quantity ?? 1)
  const tax = invoice.taxMinor ?? 0
  const purchasedAt = dateOf(subscription.created) ?? new Date()
  const draft = compact({
    purchaseId,
    entityId: row.entityId,
    kind: PurchaseKind.Subscription,
    paygate: STRIPE_PAYGATE_ALIAS,
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
    language: profile?.language ?? metadata.language ?? billingLanguageOf(country, policy),
    currency: (invoice.currency ?? subscription.currency ?? item?.price?.currency ?? 'usd').toLowerCase(),
    amountSubtotalMinor: subtotal,
    amountTaxMinor: tax,
    amountTotalMinor: invoice.totalMinor ?? subtotal + tax,
    taxBehavior: item?.price?.tax_behavior ?? undefined,
    textVersion: metadata.termsVersion ?? policy.textVersion,
    copyVersion: metadata.copyVersion ?? CONSUMER_RIGHTS_COPY_VERSION,
    startRequestId: start?.id,
    servicesStartedAt: start?.decidedAt,
    consentId: start?.id,
    consentedAt: start?.decidedAt,
    purchasedAt,
    deadline: deadlineOf(policy, scoped, purchasedAt),
  }) as PurchaseDraft
  const { record, created } = await createPurchase(ctx, draft)

  return { purchase: record, created }
}

/**
 * Refine a subscription purchase with its completed checkout: the buyer's own country (and so the
 * scope and deadline), e-mail, the charged totals, the terms acceptance and the session id; lock
 * the billing country; mail the confirmation once.
 */
export const completeSubscriptionPurchase = async (
  ctx: ApiContext, stripe: Stripe | null, session: Stripe.Checkout.Session, purchase: PurchaseRecord,
  opts: { mail?: boolean } = {},
): Promise<PurchaseRecord> => {
  const policy = await payment(ctx).consumerRightsPolicy()
  if (policy == null) {
    return purchase
  }
  const evidence = sessionEvidenceOf(session)
  const profile = await lockFromSession(ctx, policy, purchase.entityId, session, evidence)
  const country = evidence.country ?? purchase.country ?? profile?.country
  const region = regionOf(country, policy)
  const scoped = inScope(region, country, policy) || (profile != null && inScope(profile.region, profile.country, policy))
  const invoice = purchase.invoiceLineId == null || purchase.paymentIntentId == null
    ? await invoiceEvidenceOf(stripe, purchase.invoiceId ?? idOf(session.invoice)) : {}
  const purchasedAt = new Date(purchase.purchasedAt)
  const fields = compact({
    sessionId: session.id,
    invoiceId: purchase.invoiceId ?? idOf(session.invoice),
    invoiceNumber: purchase.invoiceNumber ?? invoice.invoiceNumber,
    invoiceLineId: purchase.invoiceLineId ?? invoice.invoiceLineId,
    paymentIntentId: purchase.paymentIntentId ?? invoice.paymentIntentId,
    country,
    region: region ?? undefined,
    inScope: scoped,
    deadline: scoped ? purchase.deadline ?? withdrawalDeadlineOf(purchasedAt, policy) : undefined,
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
  await patchPurchase(ctx, purchase.purchaseId, fields)
  const updated = { ...purchase, ...fields } as PurchaseRecord
  if (!scoped && purchase.deadline != null) {
    // Out of scope after all (the buyer's own country): no window.
    await patchPurchase(ctx, purchase.purchaseId, { deadline: null as unknown as undefined })
    delete updated.deadline
  }
  if (opts.mail !== false) await confirmPurchase(ctx, policy, updated)

  return updated
}
