import type { ApiClient } from '@owlmeans/api'
import type { Config } from '@owlmeans/client-config'
import { DEFAULT_KEY } from '@owlmeans/client-config'
import type { ClientContext } from '@owlmeans/client-context'
import type { ModuleHandler } from '@owlmeans/module'
import { Module } from '../types.js'

export const handler: ModuleHandler = async (req, res, ctx) => {
  const _ctx: ClientContext<Config> = ctx as unknown as ClientContext<Config>

  if (_ctx.cfg.webService == null) {
    throw new SyntaxError('No webService provided')
  }

  const module = _ctx.module<Module<any, any>>(req.alias)
  const route = await module.route.resolve(_ctx)

  let alias: string | undefined = typeof _ctx.cfg.webService === 'string'
    ? _ctx.cfg.webService
    : (route.service != null
      ? _ctx.cfg.webService[route.service] ?? _ctx.cfg.webService[DEFAULT_KEY]
      : _ctx.cfg.webService[DEFAULT_KEY])

  if (alias == null) {
    throw new SyntaxError(`Can't cast web service alias for ${module.alias} module`)
  }

  const service: ApiClient = _ctx.service(alias)

  req.path = route.path

  return service.handler(req, res, ctx)
}
