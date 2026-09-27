import {
  billingLanguageOf, chargeCurrencyOf, ConsumerRegion, ConsumerRightsError, ENTITLING_STATUSES, inScope, PurchaseKind,
  regionOf, withdrawalOpen,
} from '@owlmeans/payment'
import type { BillingProfileView, ConsumerRightsPolicy, PurchaseView } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { PURCHASE_ID_PREFIX, STRIPE_PAYGATE_ALIAS } from '../consts.js'
import {
  billingProfiles, compact, conditionalDelete, consumerEvents, fulfillments, isDuplicateKey, paygateCustomers, purchases,
  stripePricingConfig, subscriptions,
} from '../utils.js'
import { makeContractRef, normalizeEmail } from './format.js'
import type {
  BillingProfileRecord, BillingProfileSource, ConsumerEventRecord, LockOptions, PaymentSubscriptionRecord,
  PurchaseRecord, PurchaseRef, UnlockOptions,
} from '../types.js'

export const purchaseIdOf = (externalId: string): string => `${PURCHASE_ID_PREFIX}:${externalId}`

/** A locked profile as the wire sees it. */
export const profileViewOf = (record: BillingProfileRecord, policy: ConsumerRightsPolicy | null): BillingProfileView => ({
  country: record.country,
  region: record.region,
  currency: record.currency,
  locked: true,
  lockedAt: new Date(record.lockedAt),
  language: record.language,
  inScope: inScope(record.region, record.country, policy),
})

/** No profile yet: nothing locked, the default legal language, an unknown buyer (protected by default). */
export const unlockedProfileView = (policy: ConsumerRightsPolicy | null): BillingProfileView => ({
  country: null,
  region: null,
  currency: null,
  locked: false,
  language: policy?.defaultLanguage ?? 'en',
  inScope: inScope(null, null, policy),
})

/**
 * Append one audit step. A failure to write it is logged and never fails the act it describes —
 * the act's own record (consent, declaration, purchase) is already written.
 */
export const recordEvent = async (
  ctx: ApiContext, event: Omit<ConsumerEventRecord, 'at' | 'id'> & { at?: Date },
): Promise<void> => {
  try {
    await consumerEvents(ctx).create(compact({ ...event, at: event.at ?? new Date() }) as ConsumerEventRecord)
  } catch (error) {
    console.error(`[payment] consumer event "${event.action}" of "${event.recordId}" not recorded`, error)
  }
}

/** Whether a step already succeeded (or a mail was deliberately skipped) for a record. */
export const hasEvent = async (
  ctx: ApiContext, recordId: string, action: ConsumerEventRecord['action'], step?: string, ok?: boolean,
): Promise<boolean> => await consumerEvents(ctx).load(compact({
  recordId, action, ...(step != null ? { step } : {}), ...(ok != null ? { ok } : {}),
})) != null

/** The currency of the entity's entitling Stripe subscription — two of one customer cannot differ. */
export const activeSubscriptionCurrency = async (ctx: ApiContext, entityId: string): Promise<string | undefined> => {
  const row = await entitlingStripeSubscription(ctx, entityId)

  return row?.currency ?? undefined
}

/** The entity's highest-ranked entitling Stripe subscription, or `null`. */
export const entitlingStripeSubscription = async (
  ctx: ApiContext, entityId: string,
): Promise<PaymentSubscriptionRecord | null> => await subscriptions(ctx).load(
  { entityId, paygate: STRIPE_PAYGATE_ALIAS, status: [...ENTITLING_STATUSES] },
  { sort: [{ field: 'rank', order: 'desc' }, { field: 'createdAt', order: 'desc' }] },
)

/** Whether the entity ever paid through the paygate (a fulfilled checkout or a propagated subscription). */
export const hasPaid = async (ctx: ApiContext, entityId: string): Promise<boolean> =>
  await fulfillments(ctx).load({ entityId, paygate: STRIPE_PAYGATE_ALIAS, fulfilledAt: { $exists: true } }) != null
  || await subscriptions(ctx).load({ entityId, paygate: STRIPE_PAYGATE_ALIAS, initialPropagatedAt: { $exists: true } }) != null

export interface LockInput extends LockOptions {
  entityId: string
  country: string
  source: BillingProfileSource
}

export interface LockResult {
  record: BillingProfileRecord
  created: boolean
  /** The lock exists with another country: recorded as `lock-mismatch`, never relocked. */
  mismatch: boolean
}

/**
 * Fix an entity's billing country — the FIRST write wins (a unique index on `entityId` settles a
 * race). A later, different country is only a `lock-mismatch` event; only a `manual` lock with
 * `force` replaces the country, audited as `relock`. The charge currency is fixed with it: the
 * currency of an entitling paygate subscription when one exists (a customer's subscriptions share
 * one currency), else the region's (`policy.currencies`), else the given one.
 */
export const lockProfile = async (
  ctx: ApiContext, policy: ConsumerRightsPolicy | null, input: LockInput,
): Promise<LockResult> => {
  const country = input.country.trim().toUpperCase()
  if (!/^[A-Z]{2}$/.test(country)) {
    throw new ConsumerRightsError(`lock:country:${input.country}`)
  }
  const resource = billingProfiles(ctx)
  const now = new Date()
  const existing = await resource.byEntity(input.entityId)
  if (existing != null) {
    return await compareLock(ctx, policy, existing, input, country, now)
  }

  const region = regionOf(country, policy) ?? ConsumerRegion.Other
  const settlement = (await stripePricingConfig(ctx))?.settlementCurrency?.toLowerCase()
  const currency = (await activeSubscriptionCurrency(ctx, input.entityId))
    ?? (policy?.currencies != null && Object.keys(policy.currencies).length > 0
      ? chargeCurrencyOf(region, policy, input.currency ?? settlement ?? 'usd')
      : input.currency ?? settlement ?? 'usd')
  const record = compact({
    entityId: input.entityId,
    country,
    region,
    currency: currency.toLowerCase(),
    language: input.language ?? billingLanguageOf(country, policy),
    source: input.source,
    paygate: STRIPE_PAYGATE_ALIAS,
    customerId: input.customerId,
    sessionId: input.sessionId,
    ipCountry: input.ipCountry?.toUpperCase(),
    email: input.email,
    name: input.name,
    business: input.business,
    lockedAt: now,
    createdAt: now,
  }) as BillingProfileRecord
  try {
    const created = await resource.create(record)
    await recordEvent(ctx, {
      recordId: input.entityId, recordKind: 'profile', entityId: input.entityId, action: 'lock', ok: true,
      detail: JSON.stringify(compact({
        source: input.source, country, currency: created.currency, sessionId: input.sessionId,
        ipCountry: input.ipCountry?.toUpperCase(),
        ipMismatch: input.ipCountry != null ? input.ipCountry.toUpperCase() !== country : undefined,
        by: input.by, reason: input.reason,
      })),
    })

    return { record: created, created: true, mismatch: false }
  } catch (error) {
    if (!isDuplicateKey(error)) {
      throw error
    }
    const winner = await resource.byEntity(input.entityId)
    if (winner == null) {
      throw error
    }

    return await compareLock(ctx, policy, winner, input, country, now)
  }
}

const compareLock = async (
  ctx: ApiContext, policy: ConsumerRightsPolicy | null, existing: BillingProfileRecord, input: LockInput,
  country: string, now: Date,
): Promise<LockResult> => {
  if (input.source === 'manual' && input.force === true) {
    const region = regionOf(country, policy) ?? ConsumerRegion.Other
    const updated = await billingProfiles(ctx).update(compact({
      ...existing,
      country,
      region,
      currency: (input.currency ?? (country === existing.country ? existing.currency
        : chargeCurrencyOf(region, policy, existing.currency))).toLowerCase(),
      language: input.language ?? (country === existing.country ? existing.language : billingLanguageOf(country, policy)),
      source: 'manual' as const,
      updatedAt: now,
    }))
    await recordEvent(ctx, {
      recordId: existing.entityId, recordKind: 'profile', entityId: existing.entityId, action: 'relock', ok: true,
      detail: JSON.stringify(compact({
        from: existing.country, to: country, currency: updated.currency, by: input.by, reason: input.reason,
      })),
    })

    return { record: updated, created: false, mismatch: false }
  }
  const mismatch = existing.country !== country
  if (mismatch) {
    await recordEvent(ctx, {
      recordId: existing.entityId, recordKind: 'profile', entityId: existing.entityId, action: 'lock-mismatch',
      ok: true,
      detail: JSON.stringify(compact({
        locked: existing.country, observed: country, source: input.source, sessionId: input.sessionId,
        ipCountry: input.ipCountry,
      })),
    })
  }

  return { record: existing, created: false, mismatch }
}

/**
 * An operator removes an entity's lock: the profile row is deleted (only while it still holds the
 * country read — a concurrent relock survives) and an `unlock` event keeps the whole row, `by` and
 * `reason`. `null` when nothing was locked.
 */
export const unlockProfile = async (
  ctx: ApiContext, entityId: string, opts: UnlockOptions = {},
): Promise<BillingProfileRecord | null> => {
  const resource = billingProfiles(ctx)
  const existing = await resource.byEntity(entityId)
  if (existing == null) {
    return null
  }
  if (!await conditionalDelete(resource, { entityId, country: existing.country })) {
    throw new ConsumerRightsError(`unlock:changed:${entityId}`)
  }
  const { id: _id, ...row } = existing
  await recordEvent(ctx, {
    recordId: entityId, recordKind: 'profile', entityId, action: 'unlock', ok: true,
    detail: JSON.stringify(compact({ from: existing.country, by: opts.by, reason: opts.reason, profile: row })),
  })

  return existing
}

/**
 * Whether an operator unlocked the entity — then no lock is taken from its paygate customer's saved
 * address (at checkout or in reconcile): its next completed purchase locks it.
 */
export const wasUnlocked = async (ctx: ApiContext, entityId: string): Promise<boolean> =>
  await hasEvent(ctx, entityId, 'unlock')

/** Inside its window at `at`: in scope, before the deadline, neither withdrawn from nor refunded. */
export const windowOpen = (purchase: PurchaseRecord, at: Date = new Date()): boolean =>
  purchase.inScope && withdrawalOpen({
    deadline: purchase.deadline != null ? new Date(purchase.deadline) : null,
    withdrawnAt: purchase.withdrawnAt ?? null,
    refundedAt: purchase.refundedAt ?? null,
  }, at)

export const purchaseViewOf = (purchase: PurchaseRecord, withdrawable: boolean): PurchaseView => compact({
  purchaseId: purchase.purchaseId,
  contractRef: purchase.contractRef,
  kind: purchase.kind,
  purchasedAt: new Date(purchase.purchasedAt),
  deadline: purchase.deadline != null ? new Date(purchase.deadline) : undefined,
  productSku: purchase.productSku,
  planSku: purchase.planSku ?? undefined,
  amountTotalMinor: purchase.amountTotalMinor,
  currency: purchase.currency,
  consentedAt: purchase.consentedAt != null ? new Date(purchase.consentedAt) : undefined,
  withdrawnAt: purchase.withdrawnAt != null ? new Date(purchase.withdrawnAt) : undefined,
  withdrawable,
}) as PurchaseView

export const purchaseRefOf = (purchase: PurchaseRecord): PurchaseRef => compact({
  purchaseId: purchase.purchaseId,
  kind: purchase.kind,
  entityId: purchase.entityId,
  contractRef: purchase.contractRef,
  productSku: purchase.productSku,
  planSku: purchase.planSku ?? undefined,
  sessionId: purchase.sessionId ?? undefined,
  subscriptionId: purchase.subscriptionId ?? undefined,
  invoiceId: purchase.invoiceId ?? undefined,
  purchasedAt: new Date(purchase.purchasedAt),
}) as PurchaseRef

/** The open, unconsented top-up windows of an entity — what a performance consent covers. */
export const unconsentedWindows = async (ctx: ApiContext, entityId: string, at: Date = new Date()): Promise<PurchaseRecord[]> =>
  (await purchases(ctx).list({
    entityId, inScope: true, kind: PurchaseKind.TopUp, consentedAt: null, withdrawnAt: null, refundedAt: null,
    deadline: { $gt: at },
  }, { size: 100, sort: [{ field: 'deadline', order: 'desc' }] })).items

const CONTRACT_REF_ATTEMPTS = 6

export type PurchaseDraft = Omit<PurchaseRecord, 'id' | 'contractRef' | 'createdAt'>

/**
 * Write a purchase once: an existing row for the same purchase (or the same checkout session) is
 * returned as it is. A contract-reference collision retries with a fresh reference.
 */
export const createPurchase = async (
  ctx: ApiContext, draft: PurchaseDraft,
): Promise<{ record: PurchaseRecord, created: boolean }> => {
  const resource = purchases(ctx)
  const existing = await resource.byPurchaseId(draft.purchaseId)
    ?? (draft.sessionId != null ? await resource.load({ sessionId: draft.sessionId }) : null)
  if (existing != null) {
    return { record: existing, created: false }
  }
  let last: unknown = null
  for (let attempt = 0; attempt < CONTRACT_REF_ATTEMPTS; attempt++) {
    try {
      const record = await resource.create(compact({
        ...draft, contractRef: makeContractRef(new Date(draft.purchasedAt)), createdAt: new Date(),
      }) as PurchaseRecord)

      return { record, created: true }
    } catch (error) {
      if (!isDuplicateKey(error)) {
        throw error
      }
      last = error
      const winner = await resource.byPurchaseId(draft.purchaseId)
        ?? (draft.sessionId != null ? await resource.load({ sessionId: draft.sessionId }) : null)
      if (winner != null) {
        return { record: winner, created: false }
      }
    }
  }
  console.error('[payment] no free contract reference after retries', last)
  throw new ConsumerRightsError('contract-ref')
}

/** Set fields on a purchase without replacing it (a concurrent conditional write survives). */
export const patchPurchase = async (
  ctx: ApiContext, purchaseId: string, fields: Partial<PurchaseRecord>,
): Promise<void> => {
  const set = Object.fromEntries(Object.entries({ ...fields, updatedAt: new Date() }).filter(([, value]) => value !== undefined))
  const resource = purchases(ctx)
  const collection = (resource as unknown as { collection?: { updateOne?: unknown } }).collection
  if (collection?.updateOne != null) {
    await (collection.updateOne as (filter: object, update: object) => Promise<unknown>)({ purchaseId }, { $set: set })
    return
  }
  const current = await resource.byPurchaseId(purchaseId)
  if (current != null) {
    await resource.update({ ...current, ...set })
  }
}

/** The e-mail a consumer-rights mail reaches the organization at when no person named one. */
export const contactEmailOf = async (ctx: ApiContext, entityId: string): Promise<string | undefined> => {
  const profile = await billingProfiles(ctx).byEntity(entityId)
  if (profile?.email != null && profile.email !== '') {
    return profile.email
  }
  const latest = await purchases(ctx).load({ entityId, email: { $exists: true } }, {
    sort: [{ field: 'purchasedAt', order: 'desc' }],
  })
  if (latest?.email != null && latest.email !== '') {
    return latest.email
  }
  const customer = await paygateCustomers(ctx).byEntity(entityId, STRIPE_PAYGATE_ALIAS)

  return customer?.email ?? undefined
}

/**
 * Whether an e-mail address belongs to a purchase: its checkout e-mail, the organization's
 * profile e-mail or its paygate customer's — compared case-insensitively.
 */
export const emailMatches = async (ctx: ApiContext, purchase: PurchaseRecord, email: string): Promise<boolean> => {
  const wanted = normalizeEmail(email)
  if (wanted === '') {
    return false
  }
  if (normalizeEmail(purchase.email) === wanted) {
    return true
  }
  const profile = await billingProfiles(ctx).byEntity(purchase.entityId)
  if (normalizeEmail(profile?.email) === wanted) {
    return true
  }
  const customer = await paygateCustomers(ctx).byEntity(purchase.entityId, STRIPE_PAYGATE_ALIAS)

  return normalizeEmail(customer?.email) === wanted
}
