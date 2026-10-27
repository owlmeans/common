import { BotError, type BotProtocols } from '@owlmeans/bot'
import type { BasicConfig, BasicContext, BasicEntrypoint } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { handlers } from '@owlmeans/server-api'
import { bind } from '@owlmeans/server-entrypoint'
import { BOT_SERVICE } from './consts.js'
import { botOriginHelper } from './helpers/origin.js'
import type { BotServeOptions, BotService } from './types.js'

/**
 * Bind every leaf of one managing tree (`makeBotProtocols`) — the base included — to the service.
 * `scope` decides, per request, whose bots these are (the acting organization, or the application's
 * own); it is never read from the wire. The public origin for a connection's hook URL is the
 * request's (`x-forwarded-proto` + `x-forwarded-host` / `host`).
 */
export const serveBotEntrypoints = (protocols: BotProtocols, opts: BotServeOptions): BasicEntrypoint[] => {
  const api = handlers<BasicContext<BasicConfig>>()

  const scoped = async (req: AbstractRequest, ctx: BasicContext<BasicConfig>): Promise<[BotService, string]> => {
    const scope = await opts.scope(req, ctx)
    if (typeof scope !== 'string' || scope === '') {
      throw new BotError('scope-missing')
    }

    return [ctx.service<BotService>(opts.service ?? BOT_SERVICE), scope]
  }

  const originOf = (req: AbstractRequest): string | undefined => botOriginHelper.originOf(req.headers)

  return [
    bind(protocols.base),
    bind(protocols.connection.list, api.request(protocols.connection.list, async (req, ctx) => {
      const [bot, scope] = await scoped(req, ctx)
      return await bot.connections.list(scope)
    })),
    bind(protocols.connection.save, api.request(protocols.connection.save, async (req, ctx) => {
      const [bot, scope] = await scoped(req, ctx)
      return await bot.connections.save(scope, req.body, originOf(req))
    })),
    bind(protocols.connection.verify, api.request(protocols.connection.verify, async (req, ctx) => {
      const [bot, scope] = await scoped(req, ctx)
      return await bot.connections.verify(scope, `${req.params.id}`, originOf(req))
    })),
    bind(protocols.connection.remove, api.request(protocols.connection.remove, async (req, ctx) => {
      const [bot, scope] = await scoped(req, ctx)
      return await bot.connections.remove(scope, `${req.params.id}`)
    })),
    bind(protocols.connection.simulate, api.request(protocols.connection.simulate, async (req, ctx) => {
      const [bot, scope] = await scoped(req, ctx)
      return await bot.simulate(scope, `${req.params.id}`, req.body)
    })),
    bind(protocols.activity.list, api.request(protocols.activity.list, async (req, ctx) => {
      const [bot, scope] = await scoped(req, ctx)
      const connection = req.query?.connection
      const limit = req.query?.limit
      return await bot.activity.list(scope, {
        ...(typeof connection === 'string' && connection !== '' ? { connection } : {}),
        ...(limit != null && `${limit}` !== '' ? { limit: Number(limit) } : {}),
      })
    })),
  ]
}
