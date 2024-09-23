import type { Middleware } from '@owlmeans/context'
import { assertContext, MiddlewareStage, MiddlewareType } from '@owlmeans/context'
import { DEFAULT_ALIAS as WEB_ALIAS } from '@owlmeans/server-api'
import type { ApiServer } from '@owlmeans/server-api'
import { DEFAULT_ALIAS } from './consts.js'
import type { Config, Context, OidcProviderService } from './types.js'

export const createOidcProviderMiddleware = (web: string = WEB_ALIAS, oidc = DEFAULT_ALIAS) => {
  const middleware: Middleware = {
    type: MiddlewareType.Context,
    stage: MiddlewareStage.Loading,
    apply: async ctx => {
      const context = assertContext<Config, Context>(ctx as unknown as Context) as Context
      const webService = context.service<ApiServer>(web)
      const oidcService = context.service<OidcProviderService>(oidc)

      const marker = `__oidcServiceAdded-${web}-${oidc}`
      if (!ctx.cfg.records?.find(record => record.id === marker)) {
        console.log('createOidcProviderMiddleware: Middleware triggered for update...')
        await oidcService.update(webService)
        if (ctx.cfg.records == null) {
          ctx.cfg.records = []
        }
        ctx.cfg.records.push({ id: marker })
      }
    }
  }

  return middleware
}