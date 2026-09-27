import { randomBytes } from 'node:crypto'
import { AuthForbidden } from '@owlmeans/auth'
import type { AbstractRequest, EntrypointProtocolDeclaration } from '@owlmeans/entrypoint'
import { ConsumerRightsError, DeclarationChannel } from '@owlmeans/payment'
import type {
  CheckoutReadProtocols, ConsumerRightsAccountProtocols, ConsumerRightsPublicProtocols, ConsumerRightsPublicView,
  DeclarationReceipt,
} from '@owlmeans/payment'
import { handlers } from '@owlmeans/server-api'
import type { Context as ApiContext } from '@owlmeans/server-api'
import { bind } from '@owlmeans/server-entrypoint'
import type { ServerProtocolEntrypoint } from '@owlmeans/server-entrypoint'
import { CONSUMER_RIGHTS_SERVICE, GATEWAY_SERVICE } from '../consts.js'
import { payment } from '../utils.js'
import { requestOriginOf } from './origin.js'
import { unlockedProfileView } from './records.js'
import type {
  CheckoutReadHandlerOptions, ConsumerRightsHandlerOptions, ConsumerRightsService, ConsumerSubject, Context,
  GatewayService, RequestOrigin,
} from '../types.js'

type Bound = ServerProtocolEntrypoint<EntrypointProtocolDeclaration>

/** The protocol tree `makeConsumerRightsProtocols` builds, with or without its public subtree. */
export type ConsumerRightsTree = ConsumerRightsAccountProtocols & { public?: ConsumerRightsPublicProtocols }

const defaultEntity = (req: AbstractRequest, _ctx?: ApiContext): string | null => req.entity?.id ?? null

const DEFAULT_PUBLIC_MIN_MS = 1000

const sleep = async (ms: number): Promise<void> => await new Promise(resolve => setTimeout(resolve, ms))

/** Answer no sooner than `minMs` after the start — a matched declaration takes as long as an unmatched one. */
const padded = async <T>(minMs: number, run: () => Promise<T>): Promise<T> => {
  const started = Date.now()
  try {
    return await run()
  } finally {
    const left = minMs - (Date.now() - started)
    if (left > 0) await sleep(left)
  }
}

/** The public answer: what was declared and when — never a status, an amount or a match. */
const publicPart = (receipt: DeclarationReceipt): DeclarationReceipt => ({
  declarationId: receipt.declarationId, receivedAt: receipt.receivedAt, content: receipt.content, mailed: receipt.mailed,
})

/** A form a bot filled (the honeypot) gets the same shape of answer, and nothing is recorded or sent. */
const decoyReceipt = (content: Record<string, string>): DeclarationReceipt => ({
  declarationId: randomBytes(12).toString('hex'), receivedAt: new Date(), content, mailed: false,
})

const typed = (fields: Record<string, string | undefined>): Record<string, string> =>
  Object.fromEntries(Object.entries(fields).filter((entry): entry is [string, string] =>
    typeof entry[1] === 'string' && entry[1].trim() !== ''))

/**
 * Server bindings of `makeConsumerRightsProtocols`' tree over the consumer-rights service. The
 * account routes act for the request's organization (`resolveEntity`, default `req.entity.id`);
 * the money-moving acts (consent, start request, withdrawal, cancellation) pass `guardMoney` first
 * (refuse an API key there). The public routes — the statutory functions without a login — need
 * `throttle` (a wiring error otherwise), drop a filled honeypot silently, and answer every
 * declaration with the same receipt shape after at least `publicMinMs`, matched or not. Every hook
 * gets the request's context as its last argument.
 *
 * @throws SyntaxError when the tree has a public subtree and no `throttle` is given
 */
export const consumerRightsEntrypoints = (
  protocols: ConsumerRightsTree, opts: ConsumerRightsHandlerOptions = {},
): Bound[] => {
  if (protocols.public != null && opts.throttle == null) {
    throw new SyntaxError('consumer-rights: the public routes need a throttle')
  }
  const api = handlers<Context>()
  const serviceOf = (ctx: Context): ConsumerRightsService =>
    ctx.service<ConsumerRightsService>(opts.serviceAlias ?? CONSUMER_RIGHTS_SERVICE)
  const apiCtx = (ctx: Context): ApiContext => ctx as unknown as ApiContext
  const entityOf = (req: AbstractRequest, ctx: Context): string => {
    const entityId = (opts.resolveEntity ?? defaultEntity)(req, apiCtx(ctx))
    if (entityId == null || entityId === '') {
      throw new AuthForbidden('entity')
    }

    return entityId
  }
  const subjectFor = async (req: AbstractRequest, ctx: Context): Promise<ConsumerSubject> => ({
    ...(await opts.subjectOf?.(req, apiCtx(ctx)) ?? {}),
    entityId: entityOf(req, ctx),
    channel: DeclarationChannel.InApp,
  })
  const metaOf = (req: AbstractRequest, ctx: Context): RequestOrigin =>
    opts.metaOf != null ? opts.metaOf(req, apiCtx(ctx)) : requestOriginOf(req)
  const guard = async (req: AbstractRequest, action: string, ctx: Context): Promise<void> => {
    await opts.guardMoney?.(req, action, apiCtx(ctx))
  }
  const minMs = opts.publicMinMs ?? DEFAULT_PUBLIC_MIN_MS

  const bound: Bound[] = [
    bind(protocols.base),
    bind(protocols.profile, api.request(protocols.profile, async (req, ctx) =>
      await serviceOf(ctx).profile(entityOf(req, ctx))
        ?? unlockedProfileView(await payment(ctx as unknown as ApiContext).consumerRightsPolicy()))),
    bind(protocols.purchases, api.request(protocols.purchases, async (req, ctx) =>
      ({ purchases: await serviceOf(ctx).purchases(entityOf(req, ctx)) }))),
    bind(protocols.consent, api.request(protocols.consent, async (req, ctx) =>
      await serviceOf(ctx).consentView(entityOf(req, ctx)))),
    bind(protocols.giveConsent, api.body(protocols.giveConsent, async (body, ctx, req) => {
      await guard(req, 'consent', ctx)
      return await serviceOf(ctx).recordConsent(await subjectFor(req, ctx), body, metaOf(req, ctx))
    })),
    bind(protocols.start, api.request(protocols.start, async (req, ctx) =>
      await serviceOf(ctx).startView(entityOf(req, ctx), String(req.query.planSku)))),
    bind(protocols.requestStart, api.body(protocols.requestStart, async (body, ctx, req) => {
      await guard(req, 'start', ctx)
      const plan = await opts.planNameOf?.(body.planSku, body.language, req, apiCtx(ctx))
      return await serviceOf(ctx).recordStartRequest(await subjectFor(req, ctx), body, metaOf(req, ctx), plan != null ? { plan } : {})
    })),
    bind(protocols.withdrawals, api.request(protocols.withdrawals, async (req, ctx) => {
      const subject = await subjectFor(req, ctx)
      return await serviceOf(ctx).withdrawalCandidates(subject.entityId, subject)
    })),
    bind(protocols.withdraw, api.body(protocols.withdraw, async (body, ctx, req) => {
      await guard(req, 'withdraw', ctx)
      return await serviceOf(ctx).withdraw(await subjectFor(req, ctx), body, metaOf(req, ctx))
    })),
    bind(protocols.cancel, api.body(protocols.cancel, async (body, ctx, req) => {
      await guard(req, 'cancel', ctx)
      return await serviceOf(ctx).cancel(await subjectFor(req, ctx), body, metaOf(req, ctx))
    })),
  ] as Bound[]

  const pub = protocols.public
  if (pub == null) {
    return bound
  }
  const throttle = opts.throttle as NonNullable<ConsumerRightsHandlerOptions['throttle']>

  return [
    ...bound,
    bind(pub.base),
    bind(pub.policy, api.request(pub.policy, async (_req, ctx) => {
      const policy = await payment(ctx as unknown as ApiContext).consumerRightsPolicy()
      if (policy == null) {
        throw new ConsumerRightsError('policy:none')
      }
      const view: ConsumerRightsPublicView = {
        mechanisms: { withdrawal: policy.mechanisms.withdrawal, cancellation: policy.mechanisms.cancellation },
        languages: Object.keys(policy.links),
        links: policy.links,
        textVersion: policy.textVersion,
      }
      return view
    })),
    bind(pub.withdraw, api.body(pub.withdraw, async (body, ctx, req) => {
      const origin = metaOf(req, ctx)
      await throttle(req, { action: 'withdrawal', email: body.email, ...(origin.ip != null ? { ip: origin.ip } : {}) }, apiCtx(ctx))
      return await padded(minMs, async () => {
        const content = typed({ name: body.name, contract: body.contractRef, email: body.email })
        if (body.honeypot != null && body.honeypot !== '') {
          return decoyReceipt(content)
        }
        return publicPart(await serviceOf(ctx).withdraw(null, body, origin))
      })
    })),
    bind(pub.cancel, api.body(pub.cancel, async (body, ctx, req) => {
      const origin = metaOf(req, ctx)
      await throttle(req, { action: 'cancellation', email: body.email, ...(origin.ip != null ? { ip: origin.ip } : {}) }, apiCtx(ctx))
      return await padded(minMs, async () => {
        const content = typed({
          name: body.name, contract: body.contractRef, email: body.email, kind: body.kind, reason: body.reason,
          date: body.effective === 'date' ? body.date : undefined,
        })
        if (body.honeypot != null && body.honeypot !== '') {
          return decoyReceipt(content)
        }
        return publicPart(await serviceOf(ctx).cancel(null, body, origin))
      })
    })),
  ] as Bound[]
}

/**
 * Server bindings of `makeCheckoutReadProtocols`' tree: the entity's amount policy as the checkout
 * plugins narrow it now (the same computation the checkout enforces) and the synced plan prices.
 */
export const checkoutReadEntrypoints = (protocols: CheckoutReadProtocols, opts: CheckoutReadHandlerOptions = {}): Bound[] => {
  const api = handlers<Context>()
  const gatewayOf = (ctx: Context): GatewayService => ctx.service<GatewayService>(opts.gatewayAlias ?? GATEWAY_SERVICE)
  const entityOf = (req: AbstractRequest, ctx: Context): string => {
    const entityId = (opts.resolveEntity ?? defaultEntity)(req, ctx as unknown as ApiContext)
    if (entityId == null || entityId === '') {
      throw new AuthForbidden('entity')
    }

    return entityId
  }

  return [
    bind(protocols.base),
    bind(protocols.amountPolicy, api.request(protocols.amountPolicy, async (req, ctx) => {
      const { productSku, planSku } = req.query as { productSku: string, planSku?: string }
      return await gatewayOf(ctx).amountPolicy(ctx as unknown as ApiContext, entityOf(req, ctx), productSku, planSku ?? undefined)
    })),
    bind(protocols.planPrices, api.request(protocols.planPrices, async (req, ctx) => {
      entityOf(req, ctx)
      const { productSku } = req.query as { productSku: string }
      return { prices: await gatewayOf(ctx).planPrices(ctx as unknown as ApiContext, productSku) }
    })),
  ] as Bound[]
}
