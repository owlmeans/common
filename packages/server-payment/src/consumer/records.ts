import { ConsumerRegion, ConsumerRightsError, ENTITLING_STATUSES, PurchaseKind, type BillingProfileView, type ConsumerRightsPolicy, consumerRegionHelper } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import { PURCHASE_ID_PREFIX, STRIPE_PAYGATE_ALIAS } from '../consts.js'
import type {
  BillingProfileRecord, ConsumerEventRecord, PaymentSubscriptionRecord, PurchaseRecord, UnlockOptions,
} from '../types.js'
import { log } from '../log.js'
import { CONTRACT_REF_ATTEMPTS } from './consts.local.js'
import type { LockInput, LockResult, PurchaseDraft } from './types.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { consumerFormatHelper } from './format.js'
import type { ConsumerEventDraft, ConsumerRecords } from './records/types.js'

export const makeConsumerRecords = (ctx: ApiContext): ConsumerRecords => {
  const access = paymentAccessOf(ctx)

  const purchaseIdOf = (externalId: string): string => `${PURCHASE_ID_PREFIX}:${externalId}`

  const profileViewOf = (record: BillingProfileRecord, policy: ConsumerRightsPolicy | null): BillingProfileView => ({
    country: record.country,
    region: record.region,
    currency: record.currency,
    locked: true,
    lockedAt: new Date(record.lockedAt),
    language: record.language,
    inScope: consumerRegionHelper.inScope(record.region, record.country, policy),
  })

  const unlockedProfileView = (policy: ConsumerRightsPolicy | null): BillingProfileView => ({
    country: null,
    region: null,
    currency: null,
    locked: false,
    language: policy?.defaultLanguage ?? 'en',
    inScope: consumerRegionHelper.inScope(null, null, policy),
  })

  const recordEvent = async (event: ConsumerEventDraft): Promise<void> => {
    try {
      await access.consumerEvents()
        .create(paymentUtils.compact({ ...event, at: event.at ?? new Date() }) as ConsumerEventRecord)
    } catch (error) {
      log.error('Consumer event not recorded', { action: event.action, recordId: event.recordId, error })
    }
  }

  const hasEvent = async (
    recordId: string, action: ConsumerEventRecord['action'], step?: string, ok?: boolean,
  ): Promise<boolean> => await access.consumerEvents().load(paymentUtils.compact({
    recordId, action, ...(step != null ? { step } : {}), ...(ok != null ? { ok } : {}),
  })) != null

  /** The currency of the entity's entitling Stripe subscription — two of one customer cannot differ. */
  const activeSubscriptionCurrency = async (entityId: string): Promise<string | undefined> => {
    const row = await entitlingStripeSubscription(entityId)

    return row?.currency ?? undefined
  }

  const entitlingStripeSubscription = async (
    entityId: string,
  ): Promise<PaymentSubscriptionRecord | null> => await access.subscriptions().load(
    { entityId, paygate: STRIPE_PAYGATE_ALIAS, status: [...ENTITLING_STATUSES] },
    { sort: [{ field: 'rank', order: 'desc' }, { field: 'createdAt', order: 'desc' }] },
  )

  const hasPaid = async (entityId: string): Promise<boolean> =>
    await access.fulfillments().load({ entityId, paygate: STRIPE_PAYGATE_ALIAS, fulfilledAt: { $exists: true } }) != null
    || await access.subscriptions()
      .load({ entityId, paygate: STRIPE_PAYGATE_ALIAS, initialPropagatedAt: { $exists: true } }) != null

  const lockProfile = async (policy: ConsumerRightsPolicy | null, input: LockInput): Promise<LockResult> => {
    const country = input.country.trim().toUpperCase()
    if (!/^[A-Z]{2}$/.test(country)) {
      throw new ConsumerRightsError(`lock:country:${input.country}`)
    }
    const resource = access.billingProfiles()
    const now = new Date()
    const existing = await resource.byEntity(input.entityId)
    if (existing != null) {
      return await compareLock(policy, existing, input, country, now)
    }

    const region = consumerRegionHelper.regionOf(country, policy) ?? ConsumerRegion.Other
    const settlement = (await access.stripePricingConfig())?.settlementCurrency?.toLowerCase()
    const currency = (await activeSubscriptionCurrency(input.entityId))
      ?? (policy?.currencies != null && Object.keys(policy.currencies).length > 0
        ? consumerRegionHelper.chargeCurrencyOf(region, policy, input.currency ?? settlement ?? 'usd')
        : input.currency ?? settlement ?? 'usd')
    const record = paymentUtils.compact({
      entityId: input.entityId,
      country,
      region,
      currency: currency.toLowerCase(),
      language: input.language ?? consumerRegionHelper.billingLanguageOf(country, policy),
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
      await recordEvent({
        recordId: input.entityId, recordKind: 'profile', entityId: input.entityId, action: 'lock', ok: true,
        detail: JSON.stringify(paymentUtils.compact({
          source: input.source, country, currency: created.currency, sessionId: input.sessionId,
          ipCountry: input.ipCountry?.toUpperCase(),
          ipMismatch: input.ipCountry != null ? input.ipCountry.toUpperCase() !== country : undefined,
          by: input.by, reason: input.reason,
        })),
      })

      return { record: created, created: true, mismatch: false }
    } catch (error) {
      if (!paymentUtils.isDuplicateKey(error)) {
        throw error
      }
      const winner = await resource.byEntity(input.entityId)
      if (winner == null) {
        throw error
      }

      return await compareLock(policy, winner, input, country, now)
    }
  }

  const compareLock = async (
    policy: ConsumerRightsPolicy | null, existing: BillingProfileRecord, input: LockInput,
    country: string, now: Date,
  ): Promise<LockResult> => {
    if (input.source === 'manual' && input.force === true) {
      const region = consumerRegionHelper.regionOf(country, policy) ?? ConsumerRegion.Other
      const updated = await access.billingProfiles().update(paymentUtils.compact({
        ...existing,
        country,
        region,
        currency: (input.currency ?? (country === existing.country ? existing.currency
          : consumerRegionHelper.chargeCurrencyOf(region, policy, existing.currency))).toLowerCase(),
        language: input.language ?? (country === existing.country ? existing.language : consumerRegionHelper.billingLanguageOf(country, policy)),
        source: 'manual' as const,
        updatedAt: now,
      }))
      await recordEvent({
        recordId: existing.entityId, recordKind: 'profile', entityId: existing.entityId, action: 'relock', ok: true,
        detail: JSON.stringify(paymentUtils.compact({
          from: existing.country, to: country, currency: updated.currency, by: input.by, reason: input.reason,
        })),
      })

      return { record: updated, created: false, mismatch: false }
    }
    const mismatch = existing.country !== country
    if (mismatch) {
      await recordEvent({
        recordId: existing.entityId, recordKind: 'profile', entityId: existing.entityId, action: 'lock-mismatch',
        ok: true,
        detail: JSON.stringify(paymentUtils.compact({
          locked: existing.country, observed: country, source: input.source, sessionId: input.sessionId,
          ipCountry: input.ipCountry,
        })),
      })
    }

    return { record: existing, created: false, mismatch }
  }

  const unlockProfile = async (entityId: string, opts: UnlockOptions = {}): Promise<BillingProfileRecord | null> => {
    const resource = access.billingProfiles()
    const existing = await resource.byEntity(entityId)
    if (existing == null) {
      return null
    }
    if (!await paymentUtils.conditionalDelete(resource, { entityId, country: existing.country })) {
      throw new ConsumerRightsError(`unlock:changed:${entityId}`)
    }
    const { id: _id, ...row } = existing
    await recordEvent({
      recordId: entityId, recordKind: 'profile', entityId, action: 'unlock', ok: true,
      detail: JSON.stringify(paymentUtils.compact({ from: existing.country, by: opts.by, reason: opts.reason, profile: row })),
    })

    return existing
  }

  const wasUnlocked = async (entityId: string): Promise<boolean> =>
    await hasEvent(entityId, 'unlock')

  const unconsentedWindows = async (entityId: string, at: Date = new Date()): Promise<PurchaseRecord[]> =>
    (await access.purchases().list({
      entityId, inScope: true, kind: PurchaseKind.TopUp, consentedAt: null, withdrawnAt: null, refundedAt: null,
      deadline: { $gt: at },
    }, { size: 100, sort: [{ field: 'deadline', order: 'desc' }] })).items

  const createPurchase = async (draft: PurchaseDraft): Promise<{ record: PurchaseRecord, created: boolean }> => {
    const resource = access.purchases()
    const existing = await resource.byPurchaseId(draft.purchaseId)
      ?? (draft.sessionId != null ? await resource.load({ sessionId: draft.sessionId }) : null)
    if (existing != null) {
      return { record: existing, created: false }
    }
    let last: unknown = null
    for (let attempt = 0; attempt < CONTRACT_REF_ATTEMPTS; attempt++) {
      try {
        const record = await resource.create(paymentUtils.compact({
          ...draft, contractRef: consumerFormatHelper.newContractRef(new Date(draft.purchasedAt)), createdAt: new Date(),
        }) as PurchaseRecord)

        return { record, created: true }
      } catch (error) {
        if (!paymentUtils.isDuplicateKey(error)) {
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
    log.error('No free contract reference after retries', { purchaseId: draft.purchaseId, error: last })
    throw new ConsumerRightsError('contract-ref')
  }

  const patchPurchase = async (purchaseId: string, fields: Partial<PurchaseRecord>): Promise<void> => {
    const set = Object.fromEntries(Object.entries({ ...fields, updatedAt: new Date() }).filter(([, value]) => value !== undefined))
    const resource = access.purchases()
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

  const contactEmailOf = async (entityId: string): Promise<string | undefined> => {
    const profile = await access.billingProfiles().byEntity(entityId)
    if (profile?.email != null && profile.email !== '') {
      return profile.email
    }
    const latest = await access.purchases().load({ entityId, email: { $exists: true } }, {
      sort: [{ field: 'purchasedAt', order: 'desc' }],
    })
    if (latest?.email != null && latest.email !== '') {
      return latest.email
    }
    const customer = await access.paygateCustomers().byEntity(entityId, STRIPE_PAYGATE_ALIAS)

    return customer?.email ?? undefined
  }

  const emailMatches = async (purchase: PurchaseRecord, email: string): Promise<boolean> => {
    const wanted = consumerFormatHelper.normalizeEmail(email)
    if (wanted === '') {
      return false
    }
    if (consumerFormatHelper.normalizeEmail(purchase.email) === wanted) {
      return true
    }
    const profile = await access.billingProfiles().byEntity(purchase.entityId)
    if (consumerFormatHelper.normalizeEmail(profile?.email) === wanted) {
      return true
    }
    const customer = await access.paygateCustomers().byEntity(purchase.entityId, STRIPE_PAYGATE_ALIAS)

    return consumerFormatHelper.normalizeEmail(customer?.email) === wanted
  }

  return {
    purchaseIdOf, profileViewOf, unlockedProfileView, recordEvent, hasEvent, entitlingStripeSubscription, hasPaid,
    lockProfile, unlockProfile, wasUnlocked, unconsentedWindows, createPurchase, patchPurchase, contactEmailOf,
    emailMatches,
  }
}

/** The consumer-rights records of a context — one per context. */
export const consumerRecordsOf = memoHelper.oncePer(makeConsumerRecords)
