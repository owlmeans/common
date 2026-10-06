import type Stripe from 'stripe'
import { createLazyService } from '@owlmeans/context'
import { MAILER_SERVICE } from '@owlmeans/mailer'
import { cancellationEffectiveAt, CancellationKind, CancellationStatus, CancellationUnavailable, CancellationUnavailableReason, ConsentKind, CONSUMER_RIGHTS_COPY_VERSION, ConsumerRightsError, DeclarationChannel, DeclarationKind, ENTITLING_STATUSES, PaygateError, PerformanceConsentRequired, PurchaseKind, SubscriptionStartRequired, TERMINAL_STATUSES, UnknownPlan, WithdrawalStatus, WithdrawalUnavailable, WithdrawalUnavailableReason, type CancellationReceipt, type ConsumerRightsPolicy, type DeclarationReceipt, type PerformanceConsentView, type PurchaseView, type SubscriptionStartView, type WithdrawalCandidate, type WithdrawalReceipt, consumerCopyHelper, consumerRegionHelper, consumerRightsPolicyHelper } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { CONSUMER_RIGHTS_SERVICE, STRIPE_PAYGATE_ALIAS } from '../consts.js'
import { CONSUMER_RIGHTS_RESOURCE_MAKERS } from '../resource.js'
import { makeConsumerReconcileHelper } from './reconcile.js'
import type {
  WithdrawalComputation, WithdrawalExecution, ConsumerRightsInternals, ConsumerRightsRegistrar,
} from './types.js'
import type {
  Config, ConsumerConsentRecord, ConsumerDeclarationRecord, ConsumerMailRenderer, ConsumerRightsOptions,
  ConsumerRightsService, Context, PaymentSubscriptionRecord, PurchaseRecord, UsageMeter,
} from '../types.js'
import { log } from '../log.js'
import type { Plumbing } from './types.local.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { catalogueOf } from '../catalogue.js'
import { consumerFormatHelper } from './format.js'
import { originHelper } from './origin.js'
import { consumerRecordsOf } from './records.js'
import { makePurchaseModel } from '../models/purchase.js'
import { consumerMailOf } from './mail.js'
import { consumerObserversOf } from './observers.js'
import { cancellationOf } from './cancellation.js'
import { withdrawalOf } from './withdrawal.js'

const latestDeadline = (items: Array<{ deadline?: Date | null }>): Date | undefined => {
  const times = items.map(item => item.deadline != null ? new Date(item.deadline).getTime() : Number.NaN)
    .filter(time => !Number.isNaN(time))

  return times.length > 0 ? new Date(Math.max(...times)) : undefined
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

/** A withdrawal receipt from its declaration (in-app), `status` as executed so far. */
const receiptOf = (
  declaration: ConsumerDeclarationRecord, content: Record<string, string>, mailed: boolean, status?: WithdrawalStatus,
): WithdrawalReceipt => paymentUtils.compact({
  ...publicReceipt(declaration, content, mailed),
  status: status ?? declaration.status as WithdrawalStatus,
  refundMinor: declaration.refundMinor ?? undefined,
  currency: declaration.currency ?? undefined,
}) as WithdrawalReceipt

/** The late-configuration seam of every service `makeConsumerRightsService` made — module-private. */
const plumbers = new WeakMap<object, (plumbing: Plumbing, from: ConsumerRightsRegistrar) => void>()

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
    stripeFactory != null ? await stripeFactory(ctx) : await paymentAccessOf(ctx).stripeClient()
  const internals: ConsumerRightsInternals = {
    get managed() { return isManaged() }, meter: () => meter, stripe: stripeOf,
  }

  const requirePolicy = async (ctx: ApiContext): Promise<ConsumerRightsPolicy> => {
    const policy = await paymentAccessOf(ctx).payment().consumerRightsPolicy()
    if (policy == null) {
      throw new ConsumerRightsError('policy:none')
    }

    return policy
  }

  /** A contract a person quoted — a contract reference, else an invoice number. */
  const purchaseByContract = async (ctx: ApiContext, contract: string | undefined): Promise<PurchaseRecord | null> => {
    const access = paymentAccessOf(ctx)
    if (contract == null || contract.trim() === '') {
      return null
    }
    const reference = consumerFormatHelper.normalizeContractRef(contract)

    return await access.purchases().load({ contractRef: reference })
      ?? await access.purchases().load({ invoiceNumber: contract.trim() })
      ?? await access.purchases().load({ invoiceNumber: contract.trim().toUpperCase() })
  }

  /** Public matching: the quoted contract, and an e-mail that belongs to it. */
  const matchPublicPurchase = async (ctx: ApiContext, contract: string | undefined, email: string): Promise<PurchaseRecord | null> => {
    const purchase = await purchaseByContract(ctx, contract)

    return purchase != null && await consumerRecordsOf(ctx).emailMatches(purchase, email) ? purchase : null
  }

  /** The one organization whose paygate customer uses this e-mail — none when several do. */
  const entityByEmail = async (ctx: ApiContext, email: string): Promise<string | null> => {
    const wanted = consumerFormatHelper.normalizeEmail(email)
    if (wanted === '') {
      return null
    }
    // Case-insensitive (`$ilike`, its `%`/`_`/`\` wildcards escaped): a paygate keeps the e-mail as typed.
    const pattern = wanted.replace(/[\\%_]/g, match => `\\${match}`)
    const { items } = await paymentAccessOf(ctx).paygateCustomers().list({ paygate: STRIPE_PAYGATE_ALIAS, email: { $ilike: pattern } }, { size: 20 })
    const entities = [...new Set(items.filter(item => item.deletedAt == null && item.entityId != null).map(item => item.entityId as string))]

    return entities.length === 1 ? entities[0] : null
  }

  /**
   * Where a withdrawal stands now: a `processing` declaration is `refunded` once its refund (and its
   * subscription cancel) succeeded, `failed` after a failed attempt, else still `processing`.
   */
  const executedStatusOf = async (ctx: ApiContext, declaration: ConsumerDeclarationRecord): Promise<WithdrawalStatus> => {
    const access = paymentAccessOf(ctx)
    if (declaration.status !== WithdrawalStatus.Processing) {
      return declaration.status as WithdrawalStatus
    }
    const id = declaration.id as string
    const refunded = (declaration.refundMinor ?? 0) <= 0 || await access.consumerEvents().load({ recordId: id, action: 'refund', ok: true }) != null
    if (refunded) {
      return WithdrawalStatus.Refunded
    }

    return await access.consumerEvents().load({ recordId: id, action: 'refund', ok: false }) != null
      ? WithdrawalStatus.Failed : WithdrawalStatus.Processing
  }

  const bootWarnings = async (ctx: ApiContext, managed: boolean, meter: () => UsageMeter | null): Promise<void> => {
    const access = paymentAccessOf(ctx)
    const policy = await access.payment().consumerRightsPolicy()
    // An unmanaged process (a worker that asserts consent) neither mails nor refunds.
    if (policy == null || !managed) {
      return
    }
    const { mechanisms } = policy
    const mailing = mechanisms.purchaseConfirmation || mechanisms.performanceConsent || mechanisms.subscriptionStart
      || mechanisms.withdrawal || mechanisms.cancellation
    const mail = await access.consumerMailConfig()
    if (mailing) {
      const trader = mail?.trader
      if (trader?.address == null || trader.email == null) {
        log.warn('Consumer rights: the trader has no postal address or e-mail — the legal mails and the '
          + 'withdrawal information go out without them')
      }
      const alias = mail?.alias ?? MAILER_SERVICE
      if ((ctx as unknown as { hasService?: (alias: string) => boolean }).hasService?.(alias) !== true) {
        log.warn('Consumer rights: no mailer — no durable-medium mail is sent', { alias })
      }
    }
    if (managed && mechanisms.withdrawal && mechanisms.automaticRefunds && meter() == null) {
      log.warn('Consumer rights: no usage meter — every withdrawal is left to an operator (review)')
    }
  }

  const service: ConsumerRightsService = createLazyService<ConsumerRightsService>(alias, {
    get managed() { return isManaged() },

    policy: async () => await paymentAccessOf(service.assertCtx() as unknown as ApiContext).payment().consumerRightsPolicy(),

    profile: async entityId => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const access = paymentAccessOf(ctx)
      const record = await access.billingProfiles().byEntity(entityId)

      return record != null
        ? consumerRecordsOf(ctx).profileViewOf(record, await access.payment().consumerRightsPolicy()) : null
    },

    lock: async (entityId, country, source, lockOpts = {}) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const policy = await paymentAccessOf(ctx).payment().consumerRightsPolicy()
      const { record } = await consumerRecordsOf(ctx).lockProfile(policy, { ...lockOpts, entityId, country, source })

      return consumerRecordsOf(ctx).profileViewOf(record, policy)
    },

    unlock: async (entityId, unlockOpts = {}) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const record = await consumerRecordsOf(ctx).unlockProfile(entityId, unlockOpts)

      return record != null
        ? consumerRecordsOf(ctx).profileViewOf(record, await paymentAccessOf(ctx).payment().consumerRightsPolicy()) : null
    },

    purchases: async (entityId, listOpts = {}) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const at = listOpts.at ?? new Date()
      const { items } = await paymentAccessOf(ctx).purchases().list({ entityId }, {
        size: 200, sort: [{ field: 'purchasedAt', order: 'desc' }],
      })
      const views: PurchaseView[] = []
      for (const purchase of items) {
        const open = makePurchaseModel(purchase).windowOpen(at)
        if (listOpts.open === true && !open) continue
        let withdrawable = open
        if (open && meter != null && purchase.kind === PurchaseKind.TopUp) {
          try {
            withdrawable = (await withdrawalOf(ctx).computeWithdrawal(meter, purchase, at)).refundMinor > 0
          } catch (error) {
            log.warn('Purchase usage unreadable', { purchaseId: purchase.purchaseId, error })
          }
        }
        views.push(makePurchaseModel(purchase).view(withdrawable))
      }

      return views
    },

    consentView: async (entityId, at = new Date()) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const access = paymentAccessOf(ctx)
      const policy = await requirePolicy(ctx)
      const profile = await access.billingProfiles().byEntity(entityId)
      const windows = policy.mechanisms.performanceConsent
        ? await consumerRecordsOf(ctx).unconsentedWindows(entityId, at) : []
      const language = profile?.language ?? windows[0]?.language ?? policy.defaultLanguage
      const deadline = latestDeadline(windows)
      const view: PerformanceConsentView = {
        required: windows.length > 0,
        region: profile?.region ?? windows[0]?.region ?? null,
        country: profile?.country ?? windows[0]?.country ?? null,
        language,
        trader: consumerMailOf(ctx).traderOf(await access.consumerMailConfig()).name,
        ...(policy.consentContext != null ? { context: policy.consentContext } : {}),
        textVersion: policy.textVersion,
        copyVersion: CONSUMER_RIGHTS_COPY_VERSION,
        links: consumerRightsPolicyHelper.linksOf(policy, language),
        purchases: windows.map(window => makePurchaseModel(window).view(true)),
        ...(deadline != null ? { deadline } : {}),
        at,
      }

      return view
    },

    recordConsent: async (subject, body, origin) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const access = paymentAccessOf(ctx)
      const policy = await requirePolicy(ctx)
      if (!policy.mechanisms.performanceConsent) {
        throw new ConsumerRightsError('mechanism:performance-consent')
      }
      const at = new Date()
      const windows = await consumerRecordsOf(ctx).unconsentedWindows(subject.entityId, at)
      const covered = windows.filter(window => body.purchaseIds.includes(window.purchaseId))
      // A statement of another version, or one that saw none of what is open now, is asked again.
      if (body.textVersion !== policy.textVersion || (covered.length === 0 && windows.length > 0)) {
        throw new PerformanceConsentRequired({ pending: windows.length, ...(latestDeadline(windows) != null ? { deadline: latestDeadline(windows) } : {}) })
      }
      const trader = consumerMailOf(ctx).traderOf(await access.consumerMailConfig())
      const deadline = latestDeadline(covered)
      const consent = await access.consumerConsents().create(paymentUtils.compact({
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
        context: policy.consentContext,
        text: consumerCopyHelper.consentStatementOf(body.language, ConsentKind.Performance, {
          trader: trader.name, context: policy.consentContext,
        }),
        links: consumerRightsPolicyHelper.linksOf(policy, body.language),
        deadline,
        decidedAt: at,
        ...originHelper.originFields(origin),
      }) as ConsumerConsentRecord)
      for (const window of covered) {
        await paymentUtils.conditionalSet(access.purchases(), { purchaseId: window.purchaseId, consentedAt: null }, {
          consentedAt: at, consentId: consent.id, updatedAt: at,
        })
      }
      const mailed = covered.length > 0 ? await consumerMailOf(ctx).sendConsumerMail(policy, 'consent', consent.id as string) : false
      await consumerObserversOf(ctx).notifyConsent(consent)

      return { consentId: consent.id as string, consentedAt: at, purchaseIds: [...consent.purchaseIds], mailed }
    },

    assertConsent: async (entityId, at = new Date()) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const policy = await paymentAccessOf(ctx).payment().consumerRightsPolicy()
      if (policy?.mechanisms.performanceConsent !== true) {
        return
      }
      const windows = await consumerRecordsOf(ctx).unconsentedWindows(entityId, at)
      if (windows.length > 0) {
        const deadline = latestDeadline(windows)
        throw new PerformanceConsentRequired({ pending: windows.length, ...(deadline != null ? { deadline } : {}) })
      }
    },

    startView: async (entityId, planSku, viewOpts = {}) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const access = paymentAccessOf(ctx)
      const policy = await requirePolicy(ctx)
      const profile = await access.billingProfiles().byEntity(entityId)
      const language = viewOpts.language ?? profile?.language ?? policy.defaultLanguage
      // The statement follows the plan's withdrawal arithmetic — the variant `recordStartRequest` records.
      const context = consumerCopyHelper.startContextOf(await catalogueOf(ctx).findPlan(planSku))
      const view: SubscriptionStartView = {
        required: policy.mechanisms.subscriptionStart
          && (profile == null || consumerRegionHelper.inScope(profile.region, profile.country, policy)),
        planSku,
        language,
        trader: consumerMailOf(ctx).traderOf(await access.consumerMailConfig()).name,
        ...(context != null ? { context } : {}),
        textVersion: policy.textVersion,
        copyVersion: CONSUMER_RIGHTS_COPY_VERSION,
        links: consumerRightsPolicyHelper.linksOf(policy, language),
        region: profile?.region ?? null,
      }

      return view
    },

    recordStartRequest: async (subject, body, origin, startOpts = {}) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const access = paymentAccessOf(ctx)
      const policy = await requirePolicy(ctx)
      if (!policy.mechanisms.subscriptionStart) {
        throw new ConsumerRightsError('mechanism:subscription-start')
      }
      if (body.textVersion !== policy.textVersion) {
        throw new SubscriptionStartRequired(body.planSku)
      }
      const plan = await catalogueOf(ctx).findPlan(body.planSku)
      if (plan == null) {
        throw new UnknownPlan(body.planSku)
      }
      const context = consumerCopyHelper.startContextOf(plan)
      const at = new Date()
      const expiresAt = new Date(at.getTime() + (policy.startRequestTtlSeconds ?? 3600) * 1000)
      const trader = consumerMailOf(ctx).traderOf(await access.consumerMailConfig())
      const planName = startOpts.plan ?? await consumerMailOf(ctx).planTitleOf(body.planSku, body.language)
      const consent = await access.consumerConsents().create(paymentUtils.compact({
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
        context,
        text: consumerCopyHelper.consentStatementOf(body.language, ConsentKind.SubscriptionStart, { trader: trader.name, plan: planName, context }),
        links: consumerRightsPolicyHelper.linksOf(policy, body.language),
        decidedAt: at,
        expiresAt,
        ...originHelper.originFields(origin),
      }) as ConsumerConsentRecord)
      await consumerMailOf(ctx).sendConsumerMail(policy, 'start', consent.id as string)
      await consumerObserversOf(ctx).notifyConsent(consent)

      return { startRequestId: consent.id as string, requestedAt: at, expiresAt }
    },

    assertStartRequest: async (entityId, planSku, startRequestId) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const access = paymentAccessOf(ctx)
      const policy = await access.payment().consumerRightsPolicy()
      if (policy?.mechanisms.subscriptionStart !== true) {
        return null
      }
      const profile = await access.billingProfiles().byEntity(entityId)
      // Only an organization already locked outside the territories goes without one: a country
      // picked before checkout may differ from the address typed at the paygate.
      if (profile != null && !consumerRegionHelper.inScope(profile.region, profile.country, policy)) {
        return null
      }
      const record = startRequestId != null && startRequestId !== ''
        ? await access.consumerConsents().load(startRequestId).catch(() => null) : null
      if (record == null || record.kind !== ConsentKind.SubscriptionStart || record.entityId !== entityId
        || record.planSku !== planSku || record.textVersion !== policy.textVersion
        || record.expiresAt == null || new Date(record.expiresAt).getTime() <= Date.now()) {
        throw new SubscriptionStartRequired(planSku)
      }

      return record
    },

    withdrawalCandidates: async (entityId, subject = {}) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const access = paymentAccessOf(ctx)
      const policy = await requirePolicy(ctx)
      const profile = await access.billingProfiles().byEntity(entityId)
      const at = new Date()
      const open = policy.mechanisms.withdrawal
        ? (await access.purchases().list({
          entityId, inScope: true, withdrawnAt: null, refundedAt: null, deadline: { $gt: at },
        }, { size: 100, sort: [{ field: 'purchasedAt', order: 'desc' }] })).items
        : []
      const candidates: WithdrawalCandidate[] = []
      for (const purchase of open) {
        let estimate: WithdrawalCandidate['estimate'] = null
        if (meter != null) {
          try {
            estimate = (await withdrawalOf(ctx).computeWithdrawal(meter, purchase, at)).estimate
          } catch (error) {
            log.warn('Withdrawal estimate failed', { purchaseId: purchase.purchaseId, error })
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

      return paymentUtils.compact({
        candidates, language, links: consumerRightsPolicyHelper.linksOf(policy, language),
        name: subject.name != null && subject.name.trim() !== '' ? subject.name : undefined,
        email: prefillEmail(subject.email),
      }) as Awaited<ReturnType<ConsumerRightsService['withdrawalCandidates']>>
    },

    withdraw: async (subject, body, origin) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const access = paymentAccessOf(ctx)
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
        purchase = body.purchaseId != null ? await access.purchases().byPurchaseId(body.purchaseId)
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
      const profile = purchase != null ? await access.billingProfiles().byEntity(purchase.entityId) : null
      const language = body.language ?? purchase?.language ?? profile?.language ?? policy.defaultLanguage
      const declarationBase = {
        kind: DeclarationKind.Withdrawal, channel,
        entityId: purchase?.entityId ?? subject?.entityId,
        purchaseId: purchase?.purchaseId,
        subscriptionId: purchase?.subscriptionId ?? undefined,
        contractRef: body.contractRef ?? purchase?.contractRef,
        name: body.name, email: body.email, language,
        textVersion: policy.textVersion, copyVersion: CONSUMER_RIGHTS_COPY_VERSION,
        receivedAt: at, matched: purchase != null, profileId: subject?.profileId, ...originHelper.originFields(origin),
      }

      // A repeated declaration of a contract already withdrawn from: recorded, answered with the original.
      if (purchase?.withdrawnAt != null) {
        const original = purchase.withdrawalId != null ? await access.consumerDeclarations().load(purchase.withdrawalId).catch(() => null) : null
        const repeated = await access.consumerDeclarations().create(paymentUtils.compact({
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
          computation = await withdrawalOf(ctx).computeWithdrawal(meter, purchase, at)
        } catch (error) {
          await consumerRecordsOf(ctx).recordEvent({
            recordId: purchase.purchaseId, recordKind: 'purchase', entityId: purchase.entityId, action: 'meter', ok: false,
            error: paymentUtils.errorText(error),
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

      const declaration = await access.consumerDeclarations().create(paymentUtils.compact({
        ...declarationBase, status,
        refundMinor: computation?.refundMinor, currency: computation != null ? purchase?.currency : undefined,
      }) as ConsumerDeclarationRecord)
      const withdrawalId = declaration.id as string

      if (purchase != null && (status === WithdrawalStatus.Processing || status === WithdrawalStatus.Review)) {
        // The window closes now; only one declaration of a purchase wins it.
        const won = await paymentUtils.conditionalSet(access.purchases(), { purchaseId: purchase.purchaseId, withdrawnAt: null }, {
          withdrawnAt: at, withdrawalId, updatedAt: at,
        })
        if (!won) {
          const winner = await access.purchases().byPurchaseId(purchase.purchaseId)
          await consumerRecordsOf(ctx).recordEvent({
            recordId: withdrawalId, recordKind: 'declaration', entityId: purchase.entityId, action: 'duplicate', ok: true,
            detail: JSON.stringify({ of: winner?.withdrawalId }),
          })
          const original = winner?.withdrawalId != null ? await access.consumerDeclarations().load(winner.withdrawalId).catch(() => null) : null

          const answered = original ?? declaration

          return disclose
            ? receiptOf(answered, content, false, await executedStatusOf(ctx, answered))
            : publicReceipt(declaration, content, false) as WithdrawalReceipt
        }
        purchase = { ...purchase, withdrawnAt: at, withdrawalId }
      }
      if (computation != null && purchase != null) {
        await consumerRecordsOf(ctx).recordEvent({
          recordId: withdrawalId, recordKind: 'declaration', entityId: purchase.entityId, action: 'computed', ok: true,
          amountMinor: computation.refundMinor, currency: purchase.currency,
          detail: JSON.stringify({
            reading: computation.reading, deducted: computation.deducted, netMinor: computation.netMinor,
            unitsReturned: computation.unitsReturned, estimate: computation.estimate,
          }),
        })
      }
      const mailed = await consumerMailOf(ctx).sendConsumerMail(policy, 'withdrawal', withdrawalId)

      let final: WithdrawalStatus = status
      let execution: WithdrawalExecution | null = null
      if (status === WithdrawalStatus.Processing && purchase != null && computation != null) {
        execution = await withdrawalOf(ctx).executeWithdrawal(await stripeOf(ctx), declaration, purchase, computation)
        final = execution.needsReview ? WithdrawalStatus.Review : execution.ok ? WithdrawalStatus.Refunded : WithdrawalStatus.Failed
      }
      if (purchase != null && (final === WithdrawalStatus.Refunded || final === WithdrawalStatus.Review)
        && (status === WithdrawalStatus.Processing || status === WithdrawalStatus.Review)) {
        await consumerObserversOf(ctx).notifyWithdrawal(declaration, purchase, final, computation, execution)
      }

      if (!disclose) {
        return publicReceipt(declaration, content, mailed) as WithdrawalReceipt
      }

      return paymentUtils.compact({
        ...receiptOf(declaration, content, mailed), status: final,
        refundMinor: execution?.refundedMinor ?? computation?.refundMinor,
        subscriptionCanceled: execution?.subscriptionCanceled,
      }) as WithdrawalReceipt
    },

    cancel: async (subject, body, origin) => {
      const ctx = service.assertCtx() as unknown as ApiContext
      const access = paymentAccessOf(ctx)
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
          row = await access.subscriptions().byExternalId(body.subscriptionId, STRIPE_PAYGATE_ALIAS)
        } else if (body.contractRef != null) {
          purchase = await purchaseByContract(ctx, body.contractRef)
          if (purchase != null && purchase.entityId === subject.entityId && purchase.subscriptionId != null) {
            row = await access.subscriptions().byExternalId(purchase.subscriptionId, STRIPE_PAYGATE_ALIAS)
          }
        }
        row = row != null && row.entityId === subject.entityId
          ? row : await consumerRecordsOf(ctx).entitlingStripeSubscription(subject.entityId)
      } else {
        purchase = await matchPublicPurchase(ctx, body.contractRef, body.email)
        if (purchase?.subscriptionId != null) {
          row = await access.subscriptions().byExternalId(purchase.subscriptionId, STRIPE_PAYGATE_ALIAS)
        } else if (purchase == null) {
          const entityId = await entityByEmail(ctx, body.email)
          row = entityId != null ? await consumerRecordsOf(ctx).entitlingStripeSubscription(entityId) : null
        }
      }
      const live = row != null && !TERMINAL_STATUSES.includes(row.status) && ENTITLING_STATUSES.includes(row.status)
      if (disclose && row == null) throw new CancellationUnavailable(CancellationUnavailableReason.NoSubscription)
      if (disclose && !live) throw new CancellationUnavailable(CancellationUnavailableReason.Ended)
      if (row != null && purchase == null) {
        purchase = await access.purchases().load({ subscriptionId: row.externalId })
      }

      const requested = body.effective === 'date' && body.date != null ? new Date(`${body.date}T00:00:00.000Z`) : null
      const plan = row != null ? await catalogueOf(ctx).findPlan(row.planSku) : null
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
      const profile = row != null ? await access.billingProfiles().byEntity(row.entityId) : null
      const language = body.language ?? purchase?.language ?? profile?.language ?? policy.defaultLanguage
      const declaration = await access.consumerDeclarations().create(paymentUtils.compact({
        kind: DeclarationKind.Cancellation, channel,
        entityId: row?.entityId ?? subject?.entityId,
        purchaseId: purchase?.purchaseId,
        subscriptionId: row?.externalId,
        contractRef: body.contractRef ?? purchase?.contractRef,
        name: body.name, email: body.email,
        cancellationKind: body.kind, reason: body.reason, effective: body.effective, requestedDate: body.date,
        language, textVersion: policy.textVersion, copyVersion: CONSUMER_RIGHTS_COPY_VERSION,
        receivedAt: at, matched: row != null && live, profileId: subject?.profileId, status, effectiveAt,
        ...originHelper.originFields(origin),
      }) as ConsumerDeclarationRecord)
      let final = status
      if (status === CancellationStatus.Scheduled && row != null) {
        final = await cancellationOf(ctx).scheduleCancellation(await stripeOf(ctx), declaration, row)
          ? CancellationStatus.Scheduled : CancellationStatus.Received
      }
      if (purchase != null && effectiveAt != null) {
        await consumerRecordsOf(ctx).patchPurchase(purchase.purchaseId, {
          cancellationId: declaration.id as string, cancelEffectiveAt: effectiveAt,
        })
      }
      const mailed = await consumerMailOf(ctx).sendConsumerMail(policy, 'cancellation', declaration.id as string)
      await consumerObserversOf(ctx).notifyCancellation(declaration, final)
      const content = contentOf({
        name: body.name, contract: body.contractRef ?? (disclose ? purchase?.contractRef ?? row?.externalId : undefined),
        email: body.email, kind: body.kind, reason: body.reason, date: body.effective === 'date' ? body.date : undefined,
      })
      if (!disclose) {
        return publicReceipt(declaration, content, mailed) as CancellationReceipt
      }

      return paymentUtils.compact({
        ...publicReceipt(declaration, content, mailed), status: final, effectiveAt,
      }) as CancellationReceipt
    },

    useMeter: next => { meter = next },
    useMailRenderer: next => { renderer = next },
    usageMeter: () => meter,
    mailRenderer: () => renderer,

    reconcile: async (reconcileOpts = {}) =>
      await makeConsumerReconcileHelper(service.assertCtx() as unknown as ApiContext, internals)
        .reconcile(reconcileOpts),
  }, service => async () => {
    service.initialized = true
    const ctx = service.assertCtx() as unknown as ApiContext
    void ctx.waitForInitialized?.().then(async () => { await bootWarnings(ctx, isManaged(), () => meter) })
      .catch(error => { log.error('Consumer-rights boot check failed', error) })
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
    plumb(paymentUtils.compact({ manage: opts.manage, usage: opts.usage, stripe: opts.stripe }), from)
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
