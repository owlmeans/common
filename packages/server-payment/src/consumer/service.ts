import type Stripe from 'stripe'
import { createLazyService } from '@owlmeans/context'
import { MAILER_SERVICE } from '@owlmeans/mailer'
import {
  cancellationEffectiveAt, CancellationKind, CancellationStatus, CancellationUnavailable,
  CancellationUnavailableReason, ConsentKind, consentStatementOf, CONSUMER_RIGHTS_COPY_VERSION, ConsumerRightsError,
  DeclarationChannel, DeclarationKind, ENTITLING_STATUSES, inScope, linksOf, PaygateError,
  PerformanceConsentRequired, PurchaseKind, SubscriptionStartRequired, TERMINAL_STATUSES, UnknownPlan,
  WithdrawalStatus, WithdrawalUnavailable, WithdrawalUnavailableReason,
} from '@owlmeans/payment'
import type {
  CancellationReceipt, ConsumerRightsPolicy, DeclarationReceipt, PerformanceConsentView, PurchaseView,
  SubscriptionStartView, WithdrawalCandidate, WithdrawalReceipt,
} from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { CONSUMER_RIGHTS_SERVICE, STRIPE_PAYGATE_ALIAS } from '../consts.js'
import { findPlan } from '../plan.js'
import { CONSUMER_RIGHTS_RESOURCE_MAKERS } from '../resource.js'
import {
  billingProfiles, compact, conditionalSet, consumerConsents, consumerDeclarations, consumerEvents, consumerMailConfig,
  errorText, observer, paygateCustomers, payment, purchases, stripeClient, subscriptions,
} from '../utils.js'
import { normalizeContractRef, normalizeEmail } from './format.js'
import { planTitleOf, sendConsumerMail, traderOf } from './mail.js'
import { originFields } from './origin.js'
import {
  emailMatches, entitlingStripeSubscription, lockProfile, patchPurchase, profileViewOf, purchaseRefOf,
  purchaseViewOf, recordEvent, unconsentedWindows, unlockProfile, windowOpen,
} from './records.js'
import { reconcileConsumerRights } from './reconcile.js'
import { computeWithdrawal, executeWithdrawal } from './withdrawal.js'
import type { WithdrawalComputation, WithdrawalExecution } from './withdrawal.js'
import type {
  Config, ConsumerConsentRecord, ConsumerDeclarationRecord, ConsumerMailRenderer, ConsumerRightsOptions,
  ConsumerRightsService, Context, PaymentSubscriptionRecord, PurchaseRecord, UsageMeter,
} from '../types.js'

const latestDeadline = (items: Array<{ deadline?: Date | null }>): Date | undefined => {
  const times = items.map(item => item.deadline != null ? new Date(item.deadline).getTime() : Number.NaN)
    .filter(time => !Number.isNaN(time))

  return times.length > 0 ? new Date(Math.max(...times)) : undefined
}

const requirePolicy = async (ctx: ApiContext): Promise<ConsumerRightsPolicy> => {
  const policy = await payment(ctx).consumerRightsPolicy()
  if (policy == null) {
    throw new ConsumerRightsError('policy:none')
  }

  return policy
}

/** Only what a person typed, echoed as the receipt's content — never enriched with a match. */
const contentOf = (fields: Record<string, string | undefined | null>): Record<string, string> =>
  Object.fromEntries(Object.entries(fields).filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string' && entry[1].trim() !== ''))

const publicReceipt = (declaration: ConsumerDeclarationRecord, content: Record<string, string>, mailed: boolean): DeclarationReceipt => ({
  declarationId: declaration.id as string,
  receivedAt: new Date(declaration.receivedAt),
  content,
  mailed,
})

/** An e-mail value safe to prefill a form with. */
const prefillEmail = (email: string | undefined): string | undefined =>
  email != null && /^[^\s@]+@[^\s@]+$/.test(email) ? email : undefined

/** A contract a person quoted — a contract reference, else an invoice number. */
const purchaseByContract = async (ctx: ApiContext, contract: string | undefined): Promise<PurchaseRecord | null> => {
  if (contract == null || contract.trim() === '') {
    return null
  }
  const reference = normalizeContractRef(contract)

  return await purchases(ctx).load({ contractRef: reference })
    ?? await purchases(ctx).load({ invoiceNumber: contract.trim() })
    ?? await purchases(ctx).load({ invoiceNumber: contract.trim().toUpperCase() })
}

/** Public matching: the quoted contract, and an e-mail that belongs to it. */
const matchPublicPurchase = async (ctx: ApiContext, contract: string | undefined, email: string): Promise<PurchaseRecord | null> => {
  const purchase = await purchaseByContract(ctx, contract)

  return purchase != null && await emailMatches(ctx, purchase, email) ? purchase : null
}

/** The one organization whose paygate customer uses this e-mail — none when several do. */
const entityByEmail = async (ctx: ApiContext, email: string): Promise<string | null> => {
  const wanted = normalizeEmail(email)
  if (wanted === '') {
    return null
  }
  // Case-insensitive (`$ilike`, its `%`/`_`/`\` wildcards escaped): a paygate keeps the e-mail as typed.
  const pattern = wanted.replace(/[\\%_]/g, match => `\\${match}`)
  const { items } = await paygateCustomers(ctx).list({ paygate: STRIPE_PAYGATE_ALIAS, email: { $ilike: pattern } }, { size: 20 })
  const entities = [...new Set(items.filter(item => item.deletedAt == null && item.entityId != null).map(item => item.entityId as string))]

  return entities.length === 1 ? entities[0] : null
}

export interface ConsumerRightsInternals {
  readonly managed: boolean
  meter: () => UsageMeter | null
  stripe: (ctx: ApiContext) => Promise<Stripe>
}

/** Who hands a registration its options: the application itself, or the gateway on its behalf. */
export type ConsumerRightsRegistrar = 'application' | 'gateway'

/** What a later registration applies to a service already registered. */
type Plumbing = Pick<ConsumerRightsOptions, 'manage' | 'usage' | 'stripe'>

/** The late-configuration seam of every service `makeConsumerRightsService` made — module-private. */
const plumbers = new WeakMap<object, (plumbing: Plumbing, from: ConsumerRightsRegistrar) => void>()

/** Run the consumer-rights observers of one act; a throw is recorded for `reconcile` to retry. */
export const runConsumerObservers = async (
  ctx: ApiContext, family: 'consent' | 'withdrawal' | 'cancellation', recordId: string, entityId: string | undefined,
  run: () => Promise<void>,
): Promise<boolean> => {
  const recordKind = family === 'consent' ? 'consent' as const : 'declaration' as const
  try {
    await run()
    await recordEvent(ctx, { recordId, recordKind, entityId, action: 'observers', step: family, ok: true })

    return true
  } catch (error) {
    console.error(`[payment] ${family} observers of "${recordId}" failed; reconcile retries them`, error)
    await recordEvent(ctx, { recordId, recordKind, entityId, action: 'observers', step: family, ok: false, error: errorText(error) })

    return false
  }
}

/** Tell the withdrawal observers — after the records and the paygate steps. */
export const notifyWithdrawal = async (
  ctx: ApiContext, declaration: ConsumerDeclarationRecord, purchase: PurchaseRecord, status: WithdrawalStatus,
  computation: Pick<WithdrawalComputation, 'reading' | 'deducted' | 'unitsReturned' | 'netMinor' | 'refundMinor'> | null,
  execution: WithdrawalExecution | null,
): Promise<boolean> => await runConsumerObservers(ctx, 'withdrawal', declaration.id as string, purchase.entityId, async () => {
  await observer(ctx).propagateWithdrawal({
    withdrawalId: declaration.id as string,
    eventKey: `withdrawal:${declaration.id as string}`,
    entityId: purchase.entityId,
    channel: declaration.channel,
    purchase: purchaseRefOf(purchase),
    declaredAt: new Date(declaration.receivedAt),
    status,
    refund: compact({
      amountMinor: execution?.refundedMinor ?? 0,
      currency: purchase.currency,
      netMinor: computation?.netMinor,
      refundId: execution?.refundId,
      creditNoteId: execution?.creditNoteId,
    }) as { amountMinor: number, currency: string },
    units: computation != null
      ? { granted: computation.reading.granted, used: computation.deducted, returned: computation.unitsReturned } : null,
    subscriptionCanceled: execution?.subscriptionCanceled === true,
  }, ctx)
})

/** Tell the cancellation observers. */
export const notifyCancellation = async (
  ctx: ApiContext, declaration: ConsumerDeclarationRecord, status: CancellationStatus,
): Promise<boolean> => await runConsumerObservers(ctx, 'cancellation', declaration.id as string, declaration.entityId ?? undefined, async () => {
  await observer(ctx).propagateCancellation(compact({
    cancellationId: declaration.id as string,
    eventKey: `cancellation:${declaration.id as string}`,
    entityId: declaration.entityId ?? undefined,
    matched: declaration.matched,
    channel: declaration.channel,
    kind: declaration.cancellationKind ?? CancellationKind.Ordinary,
    status,
    subscriptionId: declaration.subscriptionId ?? undefined,
    effectiveAt: declaration.effectiveAt != null ? new Date(declaration.effectiveAt) : undefined,
    declaredAt: new Date(declaration.receivedAt),
  }) as Parameters<ReturnType<typeof observer>['propagateCancellation']>[0], ctx)
})

/** Tell the consent observers. */
export const notifyConsent = async (ctx: ApiContext, consent: ConsumerConsentRecord): Promise<boolean> =>
  await runConsumerObservers(ctx, 'consent', consent.id as string, consent.entityId, async () => {
    await observer(ctx).propagateConsent(compact({
      kind: consent.kind, consentId: consent.id as string, entityId: consent.entityId, profileId: consent.profileId,
      purchaseIds: [...consent.purchaseIds], planSku: consent.planSku, textVersion: consent.textVersion,
      language: consent.language, decidedAt: new Date(consent.decidedAt),
      expiresAt: consent.expiresAt != null ? new Date(consent.expiresAt) : undefined,
      eventKey: `consent:${consent.id as string}`,
    }) as Parameters<ReturnType<typeof observer>['propagateConsent']>[0], ctx)
  })

/**
 * Schedule an ordinary cancellation at the paygate: at the period end (`cancel_at_period_end`), or
 * at a later boundary (`cancel_at`, no proration). Recorded as a `cancel-scheduled` event.
 */
export const scheduleCancellation = async (
  ctx: ApiContext, stripe: Stripe, declaration: ConsumerDeclarationRecord, row: PaymentSubscriptionRecord,
  attempt: number = 0,
): Promise<boolean> => {
  const id = declaration.id as string
  const effectiveAt = declaration.effectiveAt != null ? new Date(declaration.effectiveAt) : null
  const atPeriodEnd = effectiveAt == null || row.periodEnd == null
    || effectiveAt.getTime() === new Date(row.periodEnd).getTime()
  const details = { comment: `cancellation:${id}` }
  try {
    await stripe.subscriptions.update(row.externalId, atPeriodEnd
      ? { cancel_at_period_end: true, cancellation_details: details }
      : { cancel_at: Math.floor((effectiveAt as Date).getTime() / 1000), proration_behavior: 'none', cancellation_details: details },
    { idempotencyKey: attempt > 0 ? `cancellation:${id}:schedule:${attempt}` : `cancellation:${id}:schedule` })
    await recordEvent(ctx, {
      recordId: id, recordKind: 'declaration', entityId: row.entityId, action: 'cancel-scheduled', ok: true,
      externalId: row.externalId, detail: JSON.stringify({ atPeriodEnd, effectiveAt: effectiveAt?.toISOString() }),
    })

    return true
  } catch (error) {
    await recordEvent(ctx, {
      recordId: id, recordKind: 'declaration', entityId: row.entityId, action: 'cancel-scheduled', ok: false,
      externalId: row.externalId, error: errorText(error),
    })

    return false
  }
}

/**
 * The consumer-rights service (`CONSUMER_RIGHTS_SERVICE`): the billing profile and its lock,
 * purchases and their withdrawal windows, performance consent and subscription start requests,
 * the withdrawal and cancellation functions with their paygate steps, the durable-medium mails,
 * and `reconcile`. Unmanaged (`manage: false`) it still reads, records consents and asserts them;
 * withdrawing and cancelling need the paygate.
 *
 * A lazy service, like the completion observer: `useMeter` / `useMailRenderer` work while the
 * application is still being wired, before the context initializes.
 */
export const makeConsumerRightsService = (
  alias: string = CONSUMER_RIGHTS_SERVICE, opts: ConsumerRightsOptions = {},
): ConsumerRightsService => {
  // `manage` by precedence: the application's own, else the gateway's, else managed.
  let manageOwn: boolean | undefined = opts.manage
  let manageGateway: boolean | undefined
  const isManaged = (): boolean => (manageOwn ?? manageGateway) !== false
  let meter: UsageMeter | null = opts.usage ?? null
  let stripeFactory = opts.stripe
  let renderer: ConsumerMailRenderer | null = null
  const stripeOf = async (ctx: ApiContext): Promise<Stripe> =>
    stripeFactory != null ? await stripeFactory(ctx) : await stripeClient(ctx)
  const internals: ConsumerRightsInternals = {
    get managed() { return isManaged() }, meter: () => meter, stripe: stripeOf,
  }

  const service: ConsumerRightsService = createLazyService<ConsumerRightsService>(alias, {
    get managed() { return isManaged() },

    policy: async () => await payment(service.assertCtx() as unknown as ApiContext).consumerRightsPolicy(),

    profile: async entityId => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const record = await billingProfiles(ctx).byEntity(entityId)

      return record != null ? profileViewOf(record, await payment(ctx).consumerRightsPolicy()) : null
    },

    lock: async (entityId, country, source, lockOpts = {}) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const policy = await payment(ctx).consumerRightsPolicy()
      const { record } = await lockProfile(ctx, policy, { ...lockOpts, entityId, country, source })

      return profileViewOf(record, policy)
    },

    unlock: async (entityId, unlockOpts = {}) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const record = await unlockProfile(ctx, entityId, unlockOpts)

      return record != null ? profileViewOf(record, await payment(ctx).consumerRightsPolicy()) : null
    },

    purchases: async (entityId, listOpts = {}) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const at = listOpts.at ?? new Date()
      const { items } = await purchases(ctx).list({ entityId }, {
        size: 200, sort: [{ field: 'purchasedAt', order: 'desc' }],
      })
      const views: PurchaseView[] = []
      for (const purchase of items) {
        const open = windowOpen(purchase, at)
        if (listOpts.open === true && !open) continue
        let withdrawable = open
        if (open && meter != null && purchase.kind === PurchaseKind.TopUp) {
          try {
            withdrawable = (await computeWithdrawal(ctx, meter, purchase, at)).refundMinor > 0
          } catch (error) {
            console.warn(`[payment] usage of "${purchase.purchaseId}" unreadable`, error)
          }
        }
        views.push(purchaseViewOf(purchase, withdrawable))
      }

      return views
    },

    consentView: async (entityId, at = new Date()) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const policy = await requirePolicy(ctx)
      const profile = await billingProfiles(ctx).byEntity(entityId)
      const windows = policy.mechanisms.performanceConsent ? await unconsentedWindows(ctx, entityId, at) : []
      const language = profile?.language ?? windows[0]?.language ?? policy.defaultLanguage
      const deadline = latestDeadline(windows)
      const view: PerformanceConsentView = {
        required: windows.length > 0,
        region: profile?.region ?? windows[0]?.region ?? null,
        country: profile?.country ?? windows[0]?.country ?? null,
        language,
        trader: traderOf(ctx, await consumerMailConfig(ctx)).name,
        textVersion: policy.textVersion,
        copyVersion: CONSUMER_RIGHTS_COPY_VERSION,
        links: linksOf(policy, language),
        purchases: windows.map(window => purchaseViewOf(window, true)),
        ...(deadline != null ? { deadline } : {}),
        at,
      }

      return view
    },

    recordConsent: async (subject, body, origin) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const policy = await requirePolicy(ctx)
      if (!policy.mechanisms.performanceConsent) {
        throw new ConsumerRightsError('mechanism:performance-consent')
      }
      const at = new Date()
      const windows = await unconsentedWindows(ctx, subject.entityId, at)
      const covered = windows.filter(window => body.purchaseIds.includes(window.purchaseId))
      // A statement of another version, or one that saw none of what is open now, is asked again.
      if (body.textVersion !== policy.textVersion || (covered.length === 0 && windows.length > 0)) {
        throw new PerformanceConsentRequired({ pending: windows.length, ...(latestDeadline(windows) != null ? { deadline: latestDeadline(windows) } : {}) })
      }
      const trader = traderOf(ctx, await consumerMailConfig(ctx))
      const deadline = latestDeadline(covered)
      const consent = await consumerConsents(ctx).create(compact({
        kind: ConsentKind.Performance,
        entityId: subject.entityId,
        profileId: subject.profileId,
        name: subject.name,
        email: prefillEmail(subject.email),
        purchaseIds: covered.map(window => window.purchaseId),
        textVersion: policy.textVersion,
        copyVersion: CONSUMER_RIGHTS_COPY_VERSION,
        language: body.language,
        uiLanguage: body.uiLanguage,
        trader: trader.name,
        text: consentStatementOf(body.language, ConsentKind.Performance, { trader: trader.name }),
        links: linksOf(policy, body.language),
        deadline,
        decidedAt: at,
        ...originFields(origin),
      }) as ConsumerConsentRecord)
      for (const window of covered) {
        await conditionalSet(purchases(ctx), { purchaseId: window.purchaseId, consentedAt: null }, {
          consentedAt: at, consentId: consent.id, updatedAt: at,
        })
      }
      const mailed = covered.length > 0 ? await sendConsumerMail(ctx, policy, 'consent', consent.id as string) : false
      await notifyConsent(ctx, consent)

      return { consentId: consent.id as string, consentedAt: at, purchaseIds: [...consent.purchaseIds], mailed }
    },

    assertConsent: async (entityId, at = new Date()) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const policy = await payment(ctx).consumerRightsPolicy()
      if (policy?.mechanisms.performanceConsent !== true) {
        return
      }
      const windows = await unconsentedWindows(ctx, entityId, at)
      if (windows.length > 0) {
        const deadline = latestDeadline(windows)
        throw new PerformanceConsentRequired({ pending: windows.length, ...(deadline != null ? { deadline } : {}) })
      }
    },

    startView: async (entityId, planSku, viewOpts = {}) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const policy = await requirePolicy(ctx)
      const profile = await billingProfiles(ctx).byEntity(entityId)
      const language = viewOpts.language ?? profile?.language ?? policy.defaultLanguage
      const view: SubscriptionStartView = {
        required: policy.mechanisms.subscriptionStart
          && (profile == null || inScope(profile.region, profile.country, policy)),
        planSku,
        language,
        trader: traderOf(ctx, await consumerMailConfig(ctx)).name,
        textVersion: policy.textVersion,
        copyVersion: CONSUMER_RIGHTS_COPY_VERSION,
        links: linksOf(policy, language),
        region: profile?.region ?? null,
      }

      return view
    },

    recordStartRequest: async (subject, body, origin, startOpts = {}) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const policy = await requirePolicy(ctx)
      if (!policy.mechanisms.subscriptionStart) {
        throw new ConsumerRightsError('mechanism:subscription-start')
      }
      if (body.textVersion !== policy.textVersion) {
        throw new SubscriptionStartRequired(body.planSku)
      }
      if (await findPlan(ctx, body.planSku) == null) {
        throw new UnknownPlan(body.planSku)
      }
      const at = new Date()
      const expiresAt = new Date(at.getTime() + (policy.startRequestTtlSeconds ?? 3600) * 1000)
      const trader = traderOf(ctx, await consumerMailConfig(ctx))
      const planName = startOpts.plan ?? await planTitleOf(ctx, body.planSku, body.language)
      const consent = await consumerConsents(ctx).create(compact({
        kind: ConsentKind.SubscriptionStart,
        entityId: subject.entityId,
        profileId: subject.profileId,
        name: subject.name,
        email: prefillEmail(subject.email),
        purchaseIds: [],
        planSku: body.planSku,
        planName,
        textVersion: policy.textVersion,
        copyVersion: CONSUMER_RIGHTS_COPY_VERSION,
        language: body.language,
        trader: trader.name,
        text: consentStatementOf(body.language, ConsentKind.SubscriptionStart, { trader: trader.name, plan: planName }),
        links: linksOf(policy, body.language),
        decidedAt: at,
        expiresAt,
        ...originFields(origin),
      }) as ConsumerConsentRecord)
      await sendConsumerMail(ctx, policy, 'start', consent.id as string)
      await notifyConsent(ctx, consent)

      return { startRequestId: consent.id as string, requestedAt: at, expiresAt }
    },

    assertStartRequest: async (entityId, planSku, startRequestId) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const policy = await payment(ctx).consumerRightsPolicy()
      if (policy?.mechanisms.subscriptionStart !== true) {
        return null
      }
      const profile = await billingProfiles(ctx).byEntity(entityId)
      // Only an organization already locked outside the territories goes without one: a country
      // picked before checkout may differ from the address typed at the paygate.
      if (profile != null && !inScope(profile.region, profile.country, policy)) {
        return null
      }
      const record = startRequestId != null && startRequestId !== ''
        ? await consumerConsents(ctx).load(startRequestId).catch(() => null) : null
      if (record == null || record.kind !== ConsentKind.SubscriptionStart || record.entityId !== entityId
        || record.planSku !== planSku || record.textVersion !== policy.textVersion
        || record.expiresAt == null || new Date(record.expiresAt).getTime() <= Date.now()) {
        throw new SubscriptionStartRequired(planSku)
      }

      return record
    },

    withdrawalCandidates: async (entityId, subject = {}) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const policy = await requirePolicy(ctx)
      const profile = await billingProfiles(ctx).byEntity(entityId)
      const at = new Date()
      const open = policy.mechanisms.withdrawal
        ? (await purchases(ctx).list({
          entityId, inScope: true, withdrawnAt: null, refundedAt: null, deadline: { $gt: at },
        }, { size: 100, sort: [{ field: 'purchasedAt', order: 'desc' }] })).items
        : []
      const candidates: WithdrawalCandidate[] = []
      for (const purchase of open) {
        let estimate: WithdrawalCandidate['estimate'] = null
        if (meter != null) {
          try {
            estimate = (await computeWithdrawal(ctx, meter, purchase, at)).estimate
          } catch (error) {
            console.warn(`[payment] withdrawal estimate of "${purchase.purchaseId}" failed`, error)
          }
        }
        // Credits fully used after consent: the right has expired, nothing would be reimbursed.
        if (estimate != null && purchase.kind === PurchaseKind.TopUp && estimate.refundMinor === 0) continue
        candidates.push({
          purchaseId: purchase.purchaseId,
          contractRef: purchase.contractRef,
          kind: purchase.kind,
          purchasedAt: new Date(purchase.purchasedAt),
          deadline: new Date(purchase.deadline as Date),
          amountTotalMinor: purchase.amountTotalMinor,
          currency: purchase.currency,
          estimate,
          automatic: policy.mechanisms.automaticRefunds && meter != null && isManaged(),
        })
      }
      const language = profile?.language ?? open[0]?.language ?? policy.defaultLanguage

      return compact({
        candidates, language, links: linksOf(policy, language),
        name: subject.name != null && subject.name.trim() !== '' ? subject.name : undefined,
        email: prefillEmail(subject.email),
      }) as Awaited<ReturnType<ConsumerRightsService['withdrawalCandidates']>>
    },

    withdraw: async (subject, body, origin) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const policy = await requirePolicy(ctx)
      if (!policy.mechanisms.withdrawal) {
        throw new ConsumerRightsError('mechanism:withdrawal')
      }
      if (!isManaged()) {
        throw new PaygateError('unmanaged')
      }
      const at = new Date()
      const channel = subject == null ? DeclarationChannel.Public : subject.channel ?? DeclarationChannel.InApp
      const disclose = channel === DeclarationChannel.InApp

      let purchase: PurchaseRecord | null = null
      if (subject != null) {
        purchase = body.purchaseId != null ? await purchases(ctx).byPurchaseId(body.purchaseId)
          : await purchaseByContract(ctx, body.contractRef)
        if (purchase != null && purchase.entityId !== subject.entityId) purchase = null
      } else {
        purchase = await matchPublicPurchase(ctx, body.contractRef, body.email)
      }
      if (disclose) {
        if (purchase == null) throw new WithdrawalUnavailable(WithdrawalUnavailableReason.Unknown)
        if (!purchase.inScope) throw new WithdrawalUnavailable(WithdrawalUnavailableReason.NotInScope)
        if (purchase.withdrawnAt == null && purchase.refundedAt != null) {
          throw new WithdrawalUnavailable(WithdrawalUnavailableReason.Withdrawn)
        }
      }
      const content = contentOf({
        name: body.name, contract: body.contractRef ?? (disclose ? purchase?.contractRef : undefined), email: body.email,
      })
      const profile = purchase != null ? await billingProfiles(ctx).byEntity(purchase.entityId) : null
      const language = body.language ?? purchase?.language ?? profile?.language ?? policy.defaultLanguage
      const declarationBase = {
        kind: DeclarationKind.Withdrawal, channel,
        entityId: purchase?.entityId ?? subject?.entityId,
        purchaseId: purchase?.purchaseId,
        subscriptionId: purchase?.subscriptionId ?? undefined,
        contractRef: body.contractRef ?? purchase?.contractRef,
        name: body.name, email: body.email, language,
        textVersion: policy.textVersion, copyVersion: CONSUMER_RIGHTS_COPY_VERSION,
        receivedAt: at, matched: purchase != null, profileId: subject?.profileId, ...originFields(origin),
      }

      // A repeated declaration of a contract already withdrawn from: recorded, answered with the original.
      if (purchase?.withdrawnAt != null) {
        const original = purchase.withdrawalId != null ? await consumerDeclarations(ctx).load(purchase.withdrawalId).catch(() => null) : null
        const repeated = await consumerDeclarations(ctx).create(compact({
          ...declarationBase, duplicateOf: original?.id, status: original?.status ?? WithdrawalStatus.Received,
        }) as ConsumerDeclarationRecord)
        if (!disclose) {
          return publicReceipt(repeated, content, false) as WithdrawalReceipt
        }
        const answered = original ?? repeated

        return receiptOf(answered, content, false, await executedStatusOf(ctx, answered))
      }

      let status: WithdrawalStatus
      let computation: WithdrawalComputation | null = null
      if (purchase == null || !purchase.inScope || purchase.refundedAt != null) {
        status = WithdrawalStatus.Received
      } else if (purchase.deadline == null || at.getTime() >= new Date(purchase.deadline).getTime()) {
        status = WithdrawalStatus.Expired
      } else if (meter != null && policy.mechanisms.automaticRefunds) {
        try {
          computation = await computeWithdrawal(ctx, meter, purchase, at)
        } catch (error) {
          await recordEvent(ctx, {
            recordId: purchase.purchaseId, recordKind: 'purchase', entityId: purchase.entityId, action: 'meter', ok: false,
            error: errorText(error),
          })
        }
        status = computation != null ? WithdrawalStatus.Processing : WithdrawalStatus.Review
        if (computation != null && purchase.kind === PurchaseKind.TopUp && computation.refundMinor === 0) {
          if (disclose) throw new WithdrawalUnavailable(WithdrawalUnavailableReason.Performed)
          computation = null
          status = WithdrawalStatus.Review
        }
      } else {
        status = WithdrawalStatus.Review
      }

      const declaration = await consumerDeclarations(ctx).create(compact({
        ...declarationBase, status,
        refundMinor: computation?.refundMinor, currency: computation != null ? purchase?.currency : undefined,
      }) as ConsumerDeclarationRecord)
      const withdrawalId = declaration.id as string

      if (purchase != null && (status === WithdrawalStatus.Processing || status === WithdrawalStatus.Review)) {
        // The window closes now; only one declaration of a purchase wins it.
        const won = await conditionalSet(purchases(ctx), { purchaseId: purchase.purchaseId, withdrawnAt: null }, {
          withdrawnAt: at, withdrawalId, updatedAt: at,
        })
        if (!won) {
          const winner = await purchases(ctx).byPurchaseId(purchase.purchaseId)
          await recordEvent(ctx, {
            recordId: withdrawalId, recordKind: 'declaration', entityId: purchase.entityId, action: 'duplicate', ok: true,
            detail: JSON.stringify({ of: winner?.withdrawalId }),
          })
          const original = winner?.withdrawalId != null ? await consumerDeclarations(ctx).load(winner.withdrawalId).catch(() => null) : null

          const answered = original ?? declaration

          return disclose
            ? receiptOf(answered, content, false, await executedStatusOf(ctx, answered))
            : publicReceipt(declaration, content, false) as WithdrawalReceipt
        }
        purchase = { ...purchase, withdrawnAt: at, withdrawalId }
      }
      if (computation != null && purchase != null) {
        await recordEvent(ctx, {
          recordId: withdrawalId, recordKind: 'declaration', entityId: purchase.entityId, action: 'computed', ok: true,
          amountMinor: computation.refundMinor, currency: purchase.currency,
          detail: JSON.stringify({
            reading: computation.reading, deducted: computation.deducted, netMinor: computation.netMinor,
            unitsReturned: computation.unitsReturned, estimate: computation.estimate,
          }),
        })
      }
      const mailed = await sendConsumerMail(ctx, policy, 'withdrawal', withdrawalId)

      let final: WithdrawalStatus = status
      let execution: WithdrawalExecution | null = null
      if (status === WithdrawalStatus.Processing && purchase != null && computation != null) {
        execution = await executeWithdrawal(ctx, await stripeOf(ctx), declaration, purchase, computation)
        final = execution.needsReview ? WithdrawalStatus.Review : execution.ok ? WithdrawalStatus.Refunded : WithdrawalStatus.Failed
      }
      if (purchase != null && (final === WithdrawalStatus.Refunded || final === WithdrawalStatus.Review)
        && (status === WithdrawalStatus.Processing || status === WithdrawalStatus.Review)) {
        await notifyWithdrawal(ctx, declaration, purchase, final, computation, execution)
      }

      if (!disclose) {
        return publicReceipt(declaration, content, mailed) as WithdrawalReceipt
      }

      return compact({
        ...receiptOf(declaration, content, mailed), status: final,
        refundMinor: execution?.refundedMinor ?? computation?.refundMinor,
        subscriptionCanceled: execution?.subscriptionCanceled,
      }) as WithdrawalReceipt
    },

    cancel: async (subject, body, origin) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const policy = await requirePolicy(ctx)
      if (!policy.mechanisms.cancellation) {
        throw new ConsumerRightsError('mechanism:cancellation')
      }
      if (!isManaged()) {
        throw new PaygateError('unmanaged')
      }
      const at = new Date()
      const channel = subject == null ? DeclarationChannel.Public : subject.channel ?? DeclarationChannel.InApp
      const disclose = channel === DeclarationChannel.InApp

      let purchase: PurchaseRecord | null = null
      let row: PaymentSubscriptionRecord | null = null
      if (subject != null) {
        if (body.subscriptionId != null) {
          row = await subscriptions(ctx).byExternalId(body.subscriptionId, STRIPE_PAYGATE_ALIAS)
        } else if (body.contractRef != null) {
          purchase = await purchaseByContract(ctx, body.contractRef)
          if (purchase != null && purchase.entityId === subject.entityId && purchase.subscriptionId != null) {
            row = await subscriptions(ctx).byExternalId(purchase.subscriptionId, STRIPE_PAYGATE_ALIAS)
          }
        }
        row = row != null && row.entityId === subject.entityId ? row : await entitlingStripeSubscription(ctx, subject.entityId)
      } else {
        purchase = await matchPublicPurchase(ctx, body.contractRef, body.email)
        if (purchase?.subscriptionId != null) {
          row = await subscriptions(ctx).byExternalId(purchase.subscriptionId, STRIPE_PAYGATE_ALIAS)
        } else if (purchase == null) {
          const entityId = await entityByEmail(ctx, body.email)
          row = entityId != null ? await entitlingStripeSubscription(ctx, entityId) : null
        }
      }
      const live = row != null && !TERMINAL_STATUSES.includes(row.status) && ENTITLING_STATUSES.includes(row.status)
      if (disclose && row == null) throw new CancellationUnavailable(CancellationUnavailableReason.NoSubscription)
      if (disclose && !live) throw new CancellationUnavailable(CancellationUnavailableReason.Ended)
      if (row != null && purchase == null) {
        purchase = await purchases(ctx).load({ subscriptionId: row.externalId })
      }

      const requested = body.effective === 'date' && body.date != null ? new Date(`${body.date}T00:00:00.000Z`) : null
      const plan = row != null ? await findPlan(ctx, row.planSku) : null
      let status: CancellationStatus
      let effectiveAt: Date | undefined
      if (body.kind === CancellationKind.Extraordinary) {
        // For cause: recorded and left to an operator — the paygate is not touched.
        status = CancellationStatus.Review
      } else if (row != null && live && row.periodEnd != null) {
        effectiveAt = cancellationEffectiveAt(new Date(row.periodEnd), plan?.recurring?.interval ?? 'month',
          requested != null && !Number.isNaN(requested.getTime()) ? requested : null)
        status = row.cancelAtPeriodEnd === true && effectiveAt.getTime() === new Date(row.periodEnd).getTime()
          ? CancellationStatus.AlreadyScheduled : CancellationStatus.Scheduled
      } else {
        status = CancellationStatus.Received
      }
      const profile = row != null ? await billingProfiles(ctx).byEntity(row.entityId) : null
      const language = body.language ?? purchase?.language ?? profile?.language ?? policy.defaultLanguage
      const declaration = await consumerDeclarations(ctx).create(compact({
        kind: DeclarationKind.Cancellation, channel,
        entityId: row?.entityId ?? subject?.entityId,
        purchaseId: purchase?.purchaseId,
        subscriptionId: row?.externalId,
        contractRef: body.contractRef ?? purchase?.contractRef,
        name: body.name, email: body.email,
        cancellationKind: body.kind, reason: body.reason, effective: body.effective, requestedDate: body.date,
        language, textVersion: policy.textVersion, copyVersion: CONSUMER_RIGHTS_COPY_VERSION,
        receivedAt: at, matched: row != null && live, profileId: subject?.profileId, status, effectiveAt,
        ...originFields(origin),
      }) as ConsumerDeclarationRecord)
      let final = status
      if (status === CancellationStatus.Scheduled && row != null) {
        final = await scheduleCancellation(ctx, await stripeOf(ctx), declaration, row) ? CancellationStatus.Scheduled : CancellationStatus.Received
      }
      if (purchase != null && effectiveAt != null) {
        await patchPurchase(ctx, purchase.purchaseId, { cancellationId: declaration.id as string, cancelEffectiveAt: effectiveAt })
      }
      const mailed = await sendConsumerMail(ctx, policy, 'cancellation', declaration.id as string)
      await notifyCancellation(ctx, declaration, final)
      const content = contentOf({
        name: body.name, contract: body.contractRef ?? (disclose ? purchase?.contractRef ?? row?.externalId : undefined),
        email: body.email, kind: body.kind, reason: body.reason, date: body.effective === 'date' ? body.date : undefined,
      })
      if (!disclose) {
        return publicReceipt(declaration, content, mailed) as CancellationReceipt
      }

      return compact({
        ...publicReceipt(declaration, content, mailed), status: final, effectiveAt,
      }) as CancellationReceipt
    },

    useMeter: next => { meter = next },
    useMailRenderer: next => { renderer = next },
    usageMeter: () => meter,
    mailRenderer: () => renderer,

    reconcile: async (reconcileOpts = {}) =>
      await reconcileConsumerRights(service.assertCtx() as unknown as ApiContext, internals, reconcileOpts),
  }, service => async () => {
    service.initialized = true
    const ctx = service.assertCtx() as unknown as ApiContext
    void ctx.waitForInitialized?.().then(async () => { await bootWarnings(ctx, isManaged(), () => meter) })
      .catch(error => { console.error('[payment] consumer-rights boot check failed', error) })
  })
  plumbers.set(service, (plumbing, from) => {
    if (plumbing.manage != null) {
      if (from === 'application') manageOwn = plumbing.manage
      else manageGateway = plumbing.manage
    }
    if (plumbing.usage != null) meter = plumbing.usage
    if (plumbing.stripe != null) stripeFactory = plumbing.stripe
  })

  return service
}

/** A withdrawal receipt from its declaration (in-app), `status` as executed so far. */
const receiptOf = (
  declaration: ConsumerDeclarationRecord, content: Record<string, string>, mailed: boolean, status?: WithdrawalStatus,
): WithdrawalReceipt => compact({
  ...publicReceipt(declaration, content, mailed),
  status: status ?? declaration.status as WithdrawalStatus,
  refundMinor: declaration.refundMinor ?? undefined,
  currency: declaration.currency ?? undefined,
}) as WithdrawalReceipt

/**
 * Where a withdrawal stands now: a `processing` declaration is `refunded` once its refund (and its
 * subscription cancel) succeeded, `failed` after a failed attempt, else still `processing`.
 */
const executedStatusOf = async (ctx: ApiContext, declaration: ConsumerDeclarationRecord): Promise<WithdrawalStatus> => {
  if (declaration.status !== WithdrawalStatus.Processing) {
    return declaration.status as WithdrawalStatus
  }
  const id = declaration.id as string
  const refunded = (declaration.refundMinor ?? 0) <= 0 || await consumerEvents(ctx).load({ recordId: id, action: 'refund', ok: true }) != null
  if (refunded) {
    return WithdrawalStatus.Refunded
  }

  return await consumerEvents(ctx).load({ recordId: id, action: 'refund', ok: false }) != null
    ? WithdrawalStatus.Failed : WithdrawalStatus.Processing
}

const bootWarnings = async (ctx: ApiContext, managed: boolean, meter: () => UsageMeter | null): Promise<void> => {
  const policy = await payment(ctx).consumerRightsPolicy()
  // An unmanaged process (a worker that asserts consent) neither mails nor refunds.
  if (policy == null || !managed) {
    return
  }
  const { mechanisms } = policy
  const mailing = mechanisms.purchaseConfirmation || mechanisms.performanceConsent || mechanisms.subscriptionStart
    || mechanisms.withdrawal || mechanisms.cancellation
  const mail = await consumerMailConfig(ctx)
  if (mailing) {
    const trader = mail?.trader
    if (trader?.address == null || trader.email == null) {
      console.warn('[payment] consumer rights: the trader has no postal address or e-mail — the legal mails and the '
        + 'withdrawal information go out without them')
    }
    const alias = mail?.alias ?? MAILER_SERVICE
    if ((ctx as unknown as { hasService?: (alias: string) => boolean }).hasService?.(alias) !== true) {
      console.warn(`[payment] consumer rights: no mailer "${alias}" — no durable-medium mail is sent`)
    }
  }
  if (managed && mechanisms.withdrawal && mechanisms.automaticRefunds && meter() == null) {
    console.warn('[payment] consumer rights: no usage meter — every withdrawal is left to an operator (review)')
  }
}

/**
 * Register the consumer-rights resources and service (each only when absent), or configure the
 * service already registered — `from` says who asks. The order of the application's call and the
 * gateway's is free: `usage` and `stripe` are installed whenever they come, and the application's
 * explicit `manage` wins over the gateway's. The resources keep the first registration's aliases.
 */
export const registerConsumerRights = <C extends Config, T extends Context<C>>(
  ctx: T, opts: ConsumerRightsOptions = {}, from: ConsumerRightsRegistrar = 'application',
): T => {
  for (const [alias, maker] of CONSUMER_RIGHTS_RESOURCE_MAKERS) {
    if (!ctx.hasResource(alias)) {
      ctx.registerResource(maker(opts.dbAlias, opts.serviceAlias) as never)
    }
  }
  const alias = opts.alias ?? CONSUMER_RIGHTS_SERVICE
  // A lazy service: reachable before the context initializes.
  let service = ctx.hasService(alias) ? ctx.service<ConsumerRightsService>(alias) : null
  if (service == null) {
    service = makeConsumerRightsService(alias, { ...opts, manage: undefined, usage: undefined, stripe: undefined })
    ctx.registerService(service)
  }
  const plumb = plumbers.get(service)
  if (plumb != null) {
    plumb(compact({ manage: opts.manage, usage: opts.usage, stripe: opts.stripe }), from)
  } else if (opts.usage != null) {
    // A service made elsewhere: only its public seam.
    service.useMeter(opts.usage)
  }

  return ctx
}

/**
 * Register the consumer-rights resources and service, each only when absent — the gateway
 * registration does too. Called before or after the gateway, it installs `usage` and `stripe` on
 * the service and its explicit `manage` wins over the gateway's; `useMeter` and `useMailRenderer`
 * work on the service at any time.
 */
export const appendConsumerRights = <C extends Config, T extends Context<C>>(
  ctx: T, opts: ConsumerRightsOptions = {},
): T => registerConsumerRights(ctx, opts, 'application')
