import { MAILER_SERVICE, type MailerService, type MailMessage } from '@owlmeans/mailer'
import { CancellationStatus, PurchaseKind, WithdrawalStatus, type ConsumerRightsLinks, type ConsumerRightsPolicy, type CopyValues, consumerCopyHelper, consumerRightsPolicyHelper } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { memoHelper } from '@owlmeans/context'
import type {
  ConsumerConsentRecord, ConsumerDeclarationRecord, ConsumerMailData, ConsumerMailKind, ConsumerMailPluginConfig,
  PurchaseRecord, TraderDef,
} from '../types.js'
import { log } from '../log.js'
import { RECORD_KIND } from './consts.local.js'
import type { Block, Rendered } from './types.local.js'
import { paymentAccessOf } from '../access.js'
import { paymentUtils } from '../utils.js'
import { catalogueOf } from '../catalogue.js'
import { consumerFormatHelper } from './format.js'
import { consumerRecordsOf } from './records.js'
import type { ConsumerMailHelper } from './mail/types.js'

const text = (lng: string, path: string, vars: CopyValues = {}, context?: string): string =>
  consumerCopyHelper.consumerText(lng, path, vars, context)

const textOf = (blocks: Block[], lng: string): string => blocks
  .map(block => 'text' in block ? block.text : text(lng, 'email.common.link', { label: block.label, url: block.url }))
  .join('\n\n')

const htmlOf = (blocks: Block[]): string => blocks.map(block => 'text' in block
  ? `<p>${consumerFormatHelper.escapeHtml(block.text).replace(/\n/g, '<br>')}</p>`
  : `<p>${consumerFormatHelper.escapeHtml(block.label)}: `
    + `<a href="${consumerFormatHelper.escapeHtml(block.url)}">${consumerFormatHelper.escapeHtml(block.url)}</a></p>`,
).join('\n')

const linkBlocks = (lng: string, links: ConsumerRightsLinks, which: Array<keyof ConsumerRightsLinks>): Block[] => {
  const labels: Record<keyof ConsumerRightsLinks, string> = {
    billingTerms: 'links.billing-terms',
    withdrawalInformation: 'links.withdrawal-information',
    withdrawalForm: 'links.withdrawal-form',
    withdrawalFunction: 'links.withdrawal-function',
    cancellation: 'links.cancellation',
  }

  return which
    .filter(key => links[key] != null && links[key] !== '')
    .map(key => ({ label: text(lng, labels[key]), url: links[key] as string }))
}

/** The trader as the mails and the withdrawal information name it: legal name, address, e-mail. */
const traderIdentityOf = (trader: TraderDef): string =>
  [trader.legalName, trader.address, trader.email].filter(part => part != null && part.trim() !== '').join(', ')

const renderConsent = (data: ConsumerMailData): Rendered => {
  const lng = data.language
  const consent = data.consent as ConsumerConsentRecord
  const lines = (data.purchases ?? []).map(purchase => text(lng, 'email.consent.purchase', {
    contractRef: purchase.contractRef,
    date: consumerFormatHelper.formatDate(new Date(purchase.purchasedAt), lng),
    amount: consumerFormatHelper.formatMoney(purchase.amountTotalMinor, purchase.currency, lng),
    deadline: purchase.deadline != null ? consumerFormatHelper.formatDeadline(new Date(purchase.deadline), lng) : '—',
  }))

  return {
    subject: text(lng, 'email.consent.subject'),
    blocks: [
      {
        text: text(lng, 'email.consent.body', {
          date: consumerFormatHelper.formatDateTime(new Date(consent.decidedAt), lng), statement: consent.text.checkbox,
          purchases: lines.join('\n'),
        }),
      },
      { text: text(lng, 'email.consent.unused') },
      ...linkBlocks(lng, data.links, ['billingTerms', 'withdrawalInformation', 'withdrawalFunction']),
    ],
  }
}

const renderWithdrawal = (data: ConsumerMailData): Rendered => {
  const lng = data.language
  const declaration = data.declaration as ConsumerDeclarationRecord
  const blocks: Block[] = [{
    text: text(lng, 'email.withdrawal.body', {
      date: consumerFormatHelper.formatDateTime(new Date(declaration.receivedAt), lng), name: declaration.name,
      contract: declaration.contractRef ?? data.purchase?.contractRef ?? '—', email: declaration.email,
    }),
  }]
  const status = declaration.status
  // `received`: nothing is executed on this declaration (no match, or no statutory right) — the
  // receipt says what happens if it does match, exactly as for an unknown contract.
  if (!declaration.matched || declaration.duplicateOf != null || status === WithdrawalStatus.Received) {
    blocks.push({ text: text(lng, 'email.withdrawal.unmatched') })
  } else if (status === WithdrawalStatus.Expired) {
    const deadline = data.purchase?.deadline
    blocks.push({
      text: text(lng, 'email.withdrawal.expired', {
        deadline: deadline != null ? consumerFormatHelper.formatDeadline(new Date(deadline), lng) : '—',
      }),
    })
  } else if (
    (status === WithdrawalStatus.Processing || status === WithdrawalStatus.Refunded)
    && declaration.refundMinor != null && declaration.currency != null
  ) {
    blocks.push({ text: text(lng, 'email.withdrawal.refund', { amount: consumerFormatHelper.formatMoney(declaration.refundMinor, declaration.currency, lng) }) })
  } else {
    blocks.push({ text: text(lng, 'email.withdrawal.review') })
  }
  blocks.push(...linkBlocks(lng, data.links, ['billingTerms', 'withdrawalInformation']))

  return { subject: text(lng, 'email.withdrawal.subject'), blocks }
}

const renderCancellation = (data: ConsumerMailData): Rendered => {
  const lng = data.language
  const declaration = data.declaration as ConsumerDeclarationRecord
  const requested = declaration.effective === 'date' && declaration.requestedDate != null
    ? consumerFormatHelper.formatDate(new Date(`${declaration.requestedDate}T00:00:00Z`), lng)
    : text(lng, 'cancellation.effective-earliest')
  const blocks: Block[] = [{
    text: text(lng, 'email.cancellation.body', {
      date: consumerFormatHelper.formatDateTime(new Date(declaration.receivedAt), lng), name: declaration.name,
      contract: declaration.contractRef ?? declaration.subscriptionId ?? '—',
      kind: text(lng, `cancellation.kind-${declaration.cancellationKind ?? 'ordinary'}`),
      requested, email: declaration.email,
    }),
  }]
  if (declaration.status === CancellationStatus.Review) {
    blocks.push({ text: text(lng, 'email.cancellation.review') })
  } else if (declaration.matched && declaration.effectiveAt != null) {
    blocks.push({ text: text(lng, 'email.cancellation.effective', { effectiveAt: consumerFormatHelper.formatDate(new Date(declaration.effectiveAt), lng) }) })
  } else {
    blocks.push({ text: text(lng, 'email.cancellation.unmatched') })
  }
  blocks.push(...linkBlocks(lng, data.links, ['billingTerms']))

  return { subject: text(lng, 'email.cancellation.subject'), blocks }
}

export const makeConsumerMailHelper = (ctx: ApiContext): ConsumerMailHelper => {
  const access = paymentAccessOf(ctx)
  const records = consumerRecordsOf(ctx)

  const traderOf = (mail: ConsumerMailPluginConfig | null): TraderDef =>
    mail?.trader ?? { name: ctx.cfg.service, legalName: ctx.cfg.service }

  const planTitleOf = async (planSku: string | undefined, lng: string): Promise<string> => {
    if (planSku == null) {
      return ''
    }
    const plan = await catalogueOf(ctx).findPlan(planSku)
    const localized = plan != null ? await access.payment().localize(lng, plan).catch(() => null) : null

    return localized?.title ?? plan?.title ?? planSku
  }

  const productTitleOf = async (purchase: PurchaseRecord, lng: string): Promise<string> => {
    const plan = purchase.planSku != null ? await catalogueOf(ctx).findPlan(purchase.planSku) : null
    const product = await catalogueOf(ctx).findProduct(purchase.productSku)
    const entity = plan ?? product
    const localized = entity != null ? await access.payment().localize(lng, entity).catch(() => null) : null

    return localized?.title ?? plan?.title ?? product?.title ?? purchase.productSku
  }

  const renderPurchase = async (data: ConsumerMailData): Promise<Rendered> => {
    const lng = data.language
    const purchase = data.purchase as PurchaseRecord
    const blocks: Block[] = [{
      text: text(lng, 'email.purchase.body', {
        contractRef: purchase.contractRef,
        date: consumerFormatHelper.formatDateTime(new Date(purchase.purchasedAt), lng),
        product: await productTitleOf(purchase, lng),
        total: consumerFormatHelper.formatMoney(purchase.amountTotalMinor, purchase.currency, lng),
        tax: consumerFormatHelper.formatMoney(purchase.amountTaxMinor, purchase.currency, lng),
      }),
    }]
    if (data.consent != null) {
      blocks.push({ text: text(lng, 'email.purchase.start-request', { statement: data.consent.text.checkbox }) })
    }
    const identity = traderIdentityOf(data.trader)
    blocks.push({
      text: text(lng, 'email.purchase.withdrawal-information', {
        trader: identity,
        withdrawalFunction: data.links.withdrawalFunction ?? data.links.withdrawalInformation ?? data.links.billingTerms,
      }),
    })
    blocks.push({ text: text(lng, 'email.purchase.model-form', { trader: identity }) })
    blocks.push(...linkBlocks(lng, data.links, [
      'billingTerms', 'withdrawalInformation', 'withdrawalForm', 'withdrawalFunction',
      ...(purchase.kind === PurchaseKind.Subscription ? ['cancellation' as const] : []),
    ]))

    return { subject: text(lng, 'email.purchase.subject', { contractRef: purchase.contractRef }), blocks }
  }

  const renderStart = async (data: ConsumerMailData): Promise<Rendered> => {
    const lng = data.language
    const consent = data.consent as ConsumerConsentRecord
    const title = consent.planName ?? await planTitleOf(consent.planSku, lng)

    return {
      subject: text(lng, 'email.start.subject', { plan: title }),
      blocks: [
        {
          text: text(lng, 'email.start.body', {
            date: consumerFormatHelper.formatDateTime(new Date(consent.decidedAt), lng), plan: title, statement: consent.text.checkbox,
          }),
        },
        // The rule of the variant the statement was recorded in (`_units` for a plan with a units part).
        { text: text(lng, 'email.start.rule', {}, consent.context) },
        ...linkBlocks(lng, data.links, ['billingTerms', 'withdrawalInformation', 'withdrawalFunction']),
      ],
    }
  }

  const mailDataOf = async (
    policy: ConsumerRightsPolicy, trader: TraderDef, kind: ConsumerMailKind, recordId: string,
  ): Promise<ConsumerMailData | null> => {
    const base = { kind, recordId, trader }
    switch (kind) {
      case 'purchase': {
        const purchase = await access.purchases().byPurchaseId(recordId)
        if (purchase?.email == null || purchase.email === '') return null
        const consent = purchase.startRequestId != null
          ? await access.consumerConsents().load(purchase.startRequestId).catch(() => null) : null

        return paymentUtils.compact({
          ...base, entityId: purchase.entityId, language: purchase.language, to: purchase.email,
          name: purchase.name ?? undefined, links: consumerRightsPolicyHelper.linksOf(policy, purchase.language), purchase,
          consent: consent ?? undefined,
        }) as ConsumerMailData
      }
      case 'consent':
      case 'start': {
        const consent = await access.consumerConsents().load(recordId)
        if (consent == null) return null
        const to = consent.email ?? await records.contactEmailOf(consent.entityId)
        if (to == null) return null
        const covered = consent.purchaseIds.length > 0
          ? (await access.purchases().list({ purchaseId: consent.purchaseIds }, { size: 0 })).items : []

        return paymentUtils.compact({
          ...base, entityId: consent.entityId, language: consent.language, to, name: consent.name ?? undefined,
          links: consent.links, consent, purchases: covered,
        }) as ConsumerMailData
      }
      default: {
        const declaration = await access.consumerDeclarations().load(recordId)
        if (declaration == null) return null
        const purchase = declaration.purchaseId != null ? await access.purchases().byPurchaseId(declaration.purchaseId) : null

        return paymentUtils.compact({
          ...base, entityId: declaration.entityId ?? undefined, language: declaration.language, to: declaration.email,
          name: declaration.name, links: consumerRightsPolicyHelper.linksOf(policy, declaration.language), declaration,
          purchase: purchase ?? undefined,
        }) as ConsumerMailData
      }
    }
  }

  const render = async (data: ConsumerMailData, mail: ConsumerMailPluginConfig | null): Promise<MailMessage> => {
    const lng = data.language
    const body = data.kind === 'purchase' ? await renderPurchase(data)
      : data.kind === 'consent' ? renderConsent(data)
        : data.kind === 'start' ? await renderStart(data)
          : data.kind === 'withdrawal' ? renderWithdrawal(data)
            : renderCancellation(data)
    const blocks: Block[] = [
      { text: data.name != null && data.name !== '' ? text(lng, 'email.common.greeting-named', { name: data.name }) : text(lng, 'email.common.greeting') },
      ...body.blocks,
      { text: text(lng, 'email.common.trader', { trader: traderIdentityOf(data.trader) }) },
      { text: text(lng, 'email.common.footer') },
    ]

    return paymentUtils.compact({
      to: data.to,
      subject: body.subject,
      text: textOf(blocks, lng),
      html: htmlOf(blocks),
      from: mail?.from,
      replyTo: mail?.replyTo,
    }) as MailMessage
  }

  const mailerOf = (alias: string): MailerService | null =>
    (ctx as unknown as { hasService?: (alias: string) => boolean }).hasService?.(alias) === true
      ? ctx.service<MailerService>(alias) : null

  const sendConsumerMail = async (
    policy: ConsumerRightsPolicy, kind: ConsumerMailKind, recordId: string,
  ): Promise<boolean> => {
    const recordKind = RECORD_KIND[kind]
    let entityId: string | undefined
    try {
      const mail = await access.consumerMailConfig()
      const data = await mailDataOf(policy, traderOf(mail), kind, recordId)
      entityId = data?.entityId
      if (data == null) {
        await records.recordEvent({
          recordId, recordKind, action: 'mail', step: kind, ok: true, skipped: true, detail: '{"reason":"no-recipient"}',
        })
        return false
      }
      if (consumerFormatHelper.isReservedAddress(data.to)) {
        await records.recordEvent({
          recordId, recordKind, entityId, action: 'mail', step: kind, ok: true, skipped: true,
          detail: JSON.stringify({ reason: 'reserved-domain', to: data.to }),
        })
        return false
      }
      const rendered = await render(data, mail)
      const renderer = access.consumerRightsOf()?.mailRenderer() ?? null
      const replaced = renderer != null ? await renderer(kind, data, rendered) : undefined
      if (replaced === null) {
        await records.recordEvent({
          recordId, recordKind, entityId, action: 'mail', step: kind, ok: true, skipped: true, detail: '{"reason":"renderer"}',
        })
        return false
      }
      const message = replaced ?? rendered
      const mailer = mailerOf(mail?.alias ?? MAILER_SERVICE)
      if (mailer == null) {
        await records.recordEvent({
          recordId, recordKind, entityId, action: 'mail', step: kind, ok: false, error: 'mailer:absent',
        })
        return false
      }
      await mailer.send(message)
      const archive: string[] = []
      for (const address of mail?.bcc ?? []) {
        try {
          await mailer.send({ ...message, to: address })
        } catch (error) {
          archive.push(`${address}: ${paymentUtils.errorText(error)}`)
        }
      }
      await records.recordEvent({
        recordId, recordKind, entityId, action: 'mail', step: kind, ok: true,
        detail: JSON.stringify(paymentUtils.compact({ to: message.to, subject: message.subject, archiveFailures: archive.length > 0 ? archive : undefined })),
      })

      return true
    } catch (error) {
      log.error('Consumer mail failed', { kind, recordId, error })
      await records.recordEvent({
        recordId, recordKind, entityId, action: 'mail', step: kind, ok: false, error: paymentUtils.errorText(error),
      })

      return false
    }
  }

  return { traderIdentityOf, traderOf, planTitleOf, mailDataOf, sendConsumerMail }
}

/** The consumer-rights mails of a context — one per context. */
export const consumerMailOf = memoHelper.oncePer(makeConsumerMailHelper)
