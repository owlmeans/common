import { assertContext, createService } from '@owlmeans/context'
import { DEFAULT_ALIAS, DEFAULT_PATH } from './consts.js'
import type { Config, Context, OidcProviderService } from './types.js'
import Provider from 'oidc-provider'
import type { BasicRoute } from '@owlmeans/route'
import { makeSecurityHelper } from '@owlmeans/config'
import { combineConfig } from './utils/config.js'

export const createOidcProviderService = (alias: string = DEFAULT_ALIAS): OidcProviderService => {
  const service: OidcProviderService = createService<OidcProviderService>(alias, {
    update: async api => {
      const context = assertContext<Config, Context>(service.ctx as Context, alias)
      const cfg = context.cfg.oidc
      console.log('Updating API service: ', alias, api.alias)

      const serviceRoute = context.cfg.services[
        cfg.authService ?? context.cfg.service
      ] as BasicRoute

      const helper = makeSecurityHelper<Config, Context>(context)
      const url = helper.makeUrl(serviceRoute, cfg.basePath ?? DEFAULT_PATH)

      const unsecure = context.cfg.security?.unsecure === false ? false : !url.startsWith('https')

      const oidc = new Provider(url, combineConfig(context, unsecure))

      oidc.proxy = cfg.behindProxy ?? unsecure

      await api.server.use(cfg.basePath ?? DEFAULT_PATH, oidc.callback())
    }
  }, _service => async () => {
    service.initialized = true
  })

  return service
}

export const appendOidcProviderService = <C extends Config, T extends Context<C>>(
  ctx: T, alias: string = DEFAULT_ALIAS
): T => {
  const service = createOidcProviderService(alias)
  const context = ctx as T

  context.registerService(service)

  return context
}
