import type { BotHookProtocols } from '@owlmeans/bot'
import type { BasicConfig, BasicContext, BasicEntrypoint } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { handlers } from '@owlmeans/server-api'
import { bind } from '@owlmeans/server-entrypoint'
import { BOT_SERVICE } from './consts.js'
import type { BotHookRequest, BotHookServeOptions, BotService } from './types.js'

/** What the service reads of an HTTP request; the raw body is the one `fastify-raw-body` keeps as `rawBody`. */
const hookRequestOf = (req: AbstractRequest, method: string): BotHookRequest => {
  const rawBody = (req.original as { rawBody?: string | Uint8Array } | undefined)?.rawBody

  return {
    method,
    headers: req.headers,
    query: req.query as Record<string, unknown>,
    body: req.body,
    ...(rawBody != null ? { rawBody } : {}),
  }
}

/**
 * Bind the platforms' inbound tree (`makeBotHookProtocols`): `receive` (POST) and `challenge` (GET).
 * Unguarded on purpose — the platform signs, and the service checks the signature over the raw
 * body against the connection before anything is stored. A refused signature answers 401, an
 * unknown connection 404; an accepted update answers 200 at once (handlers run in the worker).
 */
export const serveBotHookEntrypoints = (protocols: BotHookProtocols, opts: BotHookServeOptions = {}): BasicEntrypoint[] => {
  const api = handlers<BasicContext<BasicConfig>>()
  const serviceOf = (ctx: BasicContext<BasicConfig>): BotService => ctx.service<BotService>(opts.service ?? BOT_SERVICE)

  return [
    bind(protocols.base),
    bind(protocols.receive, api.request(protocols.receive, async (req, ctx) => {
      const answer = await serviceOf(ctx).receive(req.params.platform, `${req.params.connection}`, hookRequestOf(req, 'POST'))
      return answer.reply
    })),
    bind(protocols.challenge, api.request(protocols.challenge, async (req, ctx) => {
      const answer = await serviceOf(ctx).receive(req.params.platform, `${req.params.connection}`, hookRequestOf(req, 'GET'))
      return answer.text ?? answer.reply.challenge ?? ''
    })),
  ]
}
