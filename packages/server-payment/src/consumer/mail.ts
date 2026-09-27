import { MAILER_SERVICE } from '@owlmeans/mailer'
import type { MailerService, MailMessage } from '@owlmeans/mailer'
import {
  CancellationStatus, consumerText, linksOf, PurchaseKind, WithdrawalStatus,
} from '@owlmeans/payment'
import type { ConsumerRightsLinks, ConsumerRightsPolicy, CopyValues } from '@owlmeans/payment'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { findPlan, findProduct } from '../plan.js'
import {
  compact, consumerConsents, consumerDeclarations, consumerMailConfig, consumerRightsOf, errorText, payment,
  purchases,
} from '../utils.js'
import {
  escapeHtml, formatDate, formatDateTime, formatDeadline, formatMoney, isReservedAddress,
} from './format.js'
import { contactEmailOf, recordEvent } from './records.js'
import type {
  ConsumerConsentRecord, ConsumerDeclarationRecord, ConsumerMailData, ConsumerMailKind, ConsumerMailPluginConfig,
  ConsumerRecordKind, PurchaseRecord, TraderDef,
} from '../types.js'

const RECORD_KIND: Record<ConsumerMailKind, ConsumerRecordKind> = {
  purchase: 'purchase', consent: 'consent', start: 'consent', withdrawal: 'declaration', cancellation: 'declaration',
}

/** A paragraph, or a labelled link rendered as an anchor in HTML. */
type Block = { text: string } | { label: string, url: string }

interface Rendered {
  subject: string
  blocks: Block[]
}

const text = (lng: string, path: string, vars: CopyValues = {}): string => consumerText(lng, path, vars)

const textOf = (blocks: Block[], lng: string): string => blocks
  .map(block => 'text' in block ? block.text : text(lng, 'email.common.link', { label: block.label, url: block.url }))
  .join('\n\n')

const htmlOf = (blocks: Block[]): string => blocks.map(block => 'text' in block
  ? `<p>${escapeHtml(block.text).replace(/\n/g, '<br>')}</p>`
  : `<p>${escapeHtml(block.label)}: <a href="${escapeHtml(block.url)}">${escapeHtml(block.url)}</a></p>`,
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
export const traderIdentityOf = (trader: TraderDef): string =>
  [trader.legalName, trader.address, trader.email].filter(part => part != null && part.trim() !== '').join(', ')

/** The declared trader; an undeclared one falls back to the service name (no mechanism is on then). */
export const traderOf = (ctx: ApiContext, mail: ConsumerMailPluginConfig | null): TraderDef =>
  mail?.trader ?? { name: ctx.cfg.service, legalName: ctx.cfg.service }

/** A plan's title in a language: its localization, else its catalogue title, else its sku. */
export const planTitleOf = async (ctx: ApiContext, planSku: string | undefined, lng: string): Promise<string> => {
  if (planSku == null) {
    return ''
  }
  const plan = await findPlan(ctx, planSku)
  const localized = plan != null ? await payment(ctx).localize(lng, plan).catch(() => null) : null

  return localized?.title ?? plan?.title ?? planSku
}

const productTitleOf = async (ctx: ApiContext, purchase: PurchaseRecord, lng: string): Promise<string> => {
  const plan = purchase.planSku != null ? await findPlan(ctx, purchase.planSku) : null
  const product = await findProduct(ctx, purchase.productSku)
  const entity = plan ?? product
  const localized = entity != null ? await payment(ctx).localize(lng, entity).catch(() => null) : null

  return localized?.title ?? plan?.title ?? product?.title ?? purchase.productSku
}

const renderPurchase = async (ctx: ApiContext, data: ConsumerMailData): Promise<Rendered> => {
  const lng = data.language
  const purchase = data.purchase as PurchaseRecord
  const blocks: Block[] = [{
    text: text(lng, 'email.purchase.body', {
      contractRef: purchase.contractRef,
      date: formatDateTime(new Date(purchase.purchasedAt), lng),
      product: await productTitleOf(ctx, purchase, lng),
      total: formatMoney(purchase.amountTotalMinor, purchase.currency, lng),
      tax: formatMoney(purchase.amountTaxMinor, purchase.currency, lng),
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

const renderConsent = (data: ConsumerMailData): Rendered => {
  const lng = data.language
  const consent = data.consent as ConsumerConsentRecord
  const lines = (data.purchases ?? []).map(purchase => text(lng, 'email.consent.purchase', {
    contractRef: purchase.contractRef,
    date: formatDate(new Date(purchase.purchasedAt), lng),
    amount: formatMoney(purchase.amountTotalMinor, purchase.currency, lng),
    deadline: purchase.deadline != null ? formatDeadline(new Date(purchase.deadline), lng) : '—',
  }))

  return {
    subject: text(lng, 'email.consent.subject'),
    blocks: [
      {
        text: text(lng, 'email.consent.body', {
          date: formatDateTime(new Date(consent.decidedAt), lng), statement: consent.text.checkbox,
          purchases: lines.join('\n'),
        }),
      },
      { text: text(lng, 'email.consent.unused') },
      ...linkBlocks(lng, data.links, ['billingTerms', 'withdrawalInformation', 'withdrawalFunction']),
    ],
  }
}

const renderStart = async (ctx: ApiContext, data: ConsumerMailData): Promise<Rendered> => {
  const lng = data.language
  const consent = data.consent as ConsumerConsentRecord
  const title = consent.planName ?? await planTitleOf(ctx, consent.planSku, lng)

  return {
    subject: text(lng, 'email.start.subject', { plan: title }),
    blocks: [
      {
        text: text(lng, 'email.start.body', {
          date: formatDateTime(new Date(consent.decidedAt), lng), plan: title, statement: consent.text.checkbox,
        }),
      },
      { text: text(lng, 'email.start.rule') },
      ...linkBlocks(lng, data.links, ['billingTerms', 'withdrawalInformation', 'withdrawalFunction']),
    ],
  }
}

const renderWithdrawal = (data: ConsumerMailData): Rendered => {
  const lng = data.language
  const declaration = data.declaration as ConsumerDeclarationRecord
  const blocks: Block[] = [{
    text: text(lng, 'email.withdrawal.body', {
      date: formatDateTime(new Date(declaration.receivedAt), lng), name: declaration.name,
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
        deadline: deadline != null ? formatDeadline(new Date(deadline), lng) : '—',
      }),
    })
  } else if (
    (status === WithdrawalStatus.Processing || status === WithdrawalStatus.Refunded)
    && declaration.refundMinor != null && declaration.currency != null
  ) {
    blocks.push({ text: text(lng, 'email.withdrawal.refund', { amount: formatMoney(declaration.refundMinor, declaration.currency, lng) }) })
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
    ? formatDate(new Date(`${declaration.requestedDate}T00:00:00Z`), lng)
    : text(lng, 'cancellation.effective-earliest')
  const blocks: Block[] = [{
    text: text(lng, 'email.cancellation.body', {
      date: formatDateTime(new Date(declaration.receivedAt), lng), name: declaration.name,
      contract: declaration.contractRef ?? declaration.subscriptionId ?? '—',
      kind: text(lng, `cancellation.kind-${declaration.cancellationKind ?? 'ordinary'}`),
      requested, email: declaration.email,
    }),
  }]
  if (declaration.status === CancellationStatus.Review) {
    blocks.push({ text: text(lng, 'email.cancellation.review') })
  } else if (declaration.matched && declaration.effectiveAt != null) {
    blocks.push({ text: text(lng, 'email.cancellation.effective', { effectiveAt: formatDate(new Date(declaration.effectiveAt), lng) }) })
  } else {
    blocks.push({ text: text(lng, 'email.cancellation.unmatched') })
  }
  blocks.push(...linkBlocks(lng, data.links, ['billingTerms']))

  return { subject: text(lng, 'email.cancellation.subject'), blocks }
}

/**
 * Everything a mail of `kind` about `recordId` is rendered from, read back from the records — the
 * mail repeats exactly what was recorded, and a retry renders the same message. `null` when there
 * is nobody to write to.
 */
export const mailDataOf = async (
  ctx: ApiContext, policy: ConsumerRightsPolicy, trader: TraderDef, kind: ConsumerMailKind, recordId: string,
): Promise<ConsumerMailData | null> => {
  const base = { kind, recordId, trader }
  switch (kind) {
    case 'purchase': {
      const purchase = await purchases(ctx).byPurchaseId(recordId)
      if (purchase?.email == null || purchase.email === '') return null
      const consent = purchase.startRequestId != null
        ? await consumerConsents(ctx).load(purchase.startRequestId).catch(() => null) : null

      return compact({
        ...base, entityId: purchase.entityId, language: purchase.language, to: purchase.email,
        name: purchase.name ?? undefined, links: linksOf(policy, purchase.language), purchase,
        consent: consent ?? undefined,
      }) as ConsumerMailData
    }
    case 'consent':
    case 'start': {
      const consent = await consumerConsents(ctx).load(recordId)
      if (consent == null) return null
      const to = consent.email ?? await contactEmailOf(ctx, consent.entityId)
      if (to == null) return null
      const covered = consent.purchaseIds.length > 0
        ? (await purchases(ctx).list({ purchaseId: consent.purchaseIds }, { size: 0 })).items : []

      return compact({
        ...base, entityId: consent.entityId, language: consent.language, to, name: consent.name ?? undefined,
        links: consent.links, consent, purchases: covered,
      }) as ConsumerMailData
    }
    default: {
      const declaration = await consumerDeclarations(ctx).load(recordId)
      if (declaration == null) return null
      const purchase = declaration.purchaseId != null ? await purchases(ctx).byPurchaseId(declaration.purchaseId) : null

      return compact({
        ...base, entityId: declaration.entityId ?? undefined, language: declaration.language, to: declaration.email,
        name: declaration.name, links: linksOf(policy, declaration.language), declaration,
        purchase: purchase ?? undefined,
      }) as ConsumerMailData
    }
  }
}

const render = async (
  ctx: ApiContext, data: ConsumerMailData, mail: ConsumerMailPluginConfig | null,
): Promise<MailMessage> => {
  const lng = data.language
  const body = data.kind === 'purchase' ? await renderPurchase(ctx, data)
    : data.kind === 'consent' ? renderConsent(data)
      : data.kind === 'start' ? await renderStart(ctx, data)
        : data.kind === 'withdrawal' ? renderWithdrawal(data)
          : renderCancellation(data)
  const blocks: Block[] = [
    { text: data.name != null && data.name !== '' ? text(lng, 'email.common.greeting-named', { name: data.name }) : text(lng, 'email.common.greeting') },
    ...body.blocks,
    { text: text(lng, 'email.common.trader', { trader: traderIdentityOf(data.trader) }) },
    { text: text(lng, 'email.common.footer') },
  ]

  return compact({
    to: data.to,
    subject: body.subject,
    text: textOf(blocks, lng),
    html: htmlOf(blocks),
    from: mail?.from,
    replyTo: mail?.replyTo,
  }) as MailMessage
}

const mailerOf = (ctx: ApiContext, alias: string): MailerService | null =>
  (ctx as unknown as { hasService?: (alias: string) => boolean }).hasService?.(alias) === true
    ? ctx.service<MailerService>(alias) : null

/**
 * Send one consumer-rights mail on a durable medium, in the language the consumer was shown, and
 * record the outcome as a `mail` event (step = the mail kind): sent, skipped (a reserved domain
 * such as `.test` / `.example` / `.invalid` / `.localhost`, or a renderer that suppressed it) or
 * failed (a transport error, no mailer registered — retried by `reconcile`). The application's
 * renderer (`useMailRenderer`) may replace the message. Each archive (`bcc`) address gets its own
 * copy. Never throws.
 *
 * @returns whether the consumer's own copy was handed to the mailer
 */
export const sendConsumerMail = async (
  ctx: ApiContext, policy: ConsumerRightsPolicy, kind: ConsumerMailKind, recordId: string,
): Promise<boolean> => {
  const recordKind = RECORD_KIND[kind]
  let entityId: string | undefined
  try {
    const mail = await consumerMailConfig(ctx)
    const data = await mailDataOf(ctx, policy, traderOf(ctx, mail), kind, recordId)
    entityId = data?.entityId
    if (data == null) {
      await recordEvent(ctx, { recordId, recordKind, action: 'mail', step: kind, ok: true, skipped: true, detail: '{"reason":"no-recipient"}' })
      return false
    }
    if (isReservedAddress(data.to)) {
      await recordEvent(ctx, {
        recordId, recordKind, entityId, action: 'mail', step: kind, ok: true, skipped: true,
        detail: JSON.stringify({ reason: 'reserved-domain', to: data.to }),
      })
      return false
    }
    const rendered = await render(ctx, data, mail)
    const renderer = consumerRightsOf(ctx)?.mailRenderer() ?? null
    const replaced = renderer != null ? await renderer(kind, data, rendered) : undefined
    if (replaced === null) {
      await recordEvent(ctx, {
        recordId, recordKind, entityId, action: 'mail', step: kind, ok: true, skipped: true, detail: '{"reason":"renderer"}',
      })
      return false
    }
    const message = replaced ?? rendered
    const mailer = mailerOf(ctx, mail?.alias ?? MAILER_SERVICE)
    if (mailer == null) {
      await recordEvent(ctx, { recordId, recordKind, entityId, action: 'mail', step: kind, ok: false, error: 'mailer:absent' })
      return false
    }
    await mailer.send(message)
    const archive: string[] = []
    for (const address of mail?.bcc ?? []) {
      try {
        await mailer.send({ ...message, to: address })
      } catch (error) {
        archive.push(`${address}: ${errorText(error)}`)
      }
    }
    await recordEvent(ctx, {
      recordId, recordKind, entityId, action: 'mail', step: kind, ok: true,
      detail: JSON.stringify(compact({ to: message.to, subject: message.subject, archiveFailures: archive.length > 0 ? archive : undefined })),
    })

    return true
  } catch (error) {
    console.error(`[payment] consumer mail "${kind}" of "${recordId}" failed`, error)
    await recordEvent(ctx, { recordId, recordKind, entityId, action: 'mail', step: kind, ok: false, error: errorText(error) })

    return false
  }
}
