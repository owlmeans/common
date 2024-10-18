import { DEF_OIDC_ACCOUNT_LINKING, DEF_OIDC_PROVIDER_API, DEFAULT_ALIAS } from './consts.js'
import { assertContext, createService } from '@owlmeans/context'
import type { AccountLinkingService, Config, Context, OidcClientService, ProviderApiService } from './types.js'
import { AuthManagerError } from '@owlmeans/auth'
import { makeSecurityHelper } from '@owlmeans/config'
import type { BaseClient } from 'openid-client'
import { custom, Issuer } from 'openid-client'
import type { OidcProviderConfig } from '@owlmeans/oidc'

export const makeOidcClientService = (alias: string = DEFAULT_ALIAS): OidcClientService => {
  const service: OidcClientService = createService<OidcClientService>(alias, {
    getIssuer: async clientId => {
      const context = assertContext<Config, Context>(service.ctx as Context, alias)
      let cfg = await service.getConfig(clientId)

      if (cfg?.basePath == null) {
        throw new AuthManagerError('oidc.client.basepath')
      }

      if (cfg.service == null) {
        throw new AuthManagerError('oidc.client.service')
      }

      // @TODO Add support for any domain (not just registered services)
      const security = makeSecurityHelper<Config, Context>(context)
      const url = cfg.discoveryUrl
        ?? security.makeUrl(context.cfg.services[cfg.service], cfg.basePath)

      Issuer[custom.http_options] = (_, options) => {
        return {
          ...options,
          timeout: 15000
        }
      }
      console.log('External service url', url)

      const issuer = await Issuer.discover(url)

      return issuer
    },

    getClient: async clientId => {
      let issuer: Issuer<BaseClient> | null = typeof clientId === 'string' ? null : (clientId ?? null)
      // @TODO Do not forget to delete it
      console.log('!!!! Here comes issuers meta: ', typeof clientId === 'string' ? clientId : issuer?.metadata)
      let _clientId = typeof clientId === 'string' ? clientId : issuer?.metadata.issuer

      if (_clientId == null) {
        throw new AuthManagerError('oidc.client.client-id')
      }

      issuer ??= await service.getIssuer(_clientId)

      const cfg = await service.getConfig(_clientId)
      if (cfg?.secret == null) {
        throw new AuthManagerError('oidc.client.secert')
      }

      return new issuer.Client({ client_id: _clientId, client_secret: cfg?.secret })
    },

    getConfig: async clientId => {
      const context = assertContext<Config, Context>(service.ctx as Context, alias)

      return context.cfg.oidc.providers?.find(consumer => consumer.clientId === clientId)
    },

    getDefault: () => {
      const context = assertContext<Config, Context>(service.ctx as Context, alias)

      return context.cfg.oidc.providers?.find(consumer => consumer.def)?.clientId
    },

    providerApi: () => {
      const context = assertContext<Config, Context>(service.ctx as Context, alias)
      const cfg = context.cfg.oidc
      const providerApiService = cfg.providerApiService ?? DEF_OIDC_PROVIDER_API
      if (context.hasService(providerApiService)) {
        return context.service<ProviderApiService>(providerApiService)
      }
      return null
    },

    accountLinking: () => {
      const context = assertContext<Config, Context>(service.ctx as Context, alias)
      const cfg = context.cfg.oidc
      const accountLinkingService = cfg.accountLinkingService ?? DEF_OIDC_ACCOUNT_LINKING
      if (context.hasService(accountLinkingService)) {
        return context.service<AccountLinkingService>(accountLinkingService)
      }
      return null
    },

    hasProvider: entityId => {
      const ctx = service.assertCtx<Config, Context>()
      if (ctx.cfg.oidc.providers == null) {
        ctx.cfg.oidc.providers = []
      }

      return ctx.cfg.oidc.providers.some(provider => provider.entityId === entityId)
    },

    registerTemporaryProvider: config => {
      const ctx = service.assertCtx<Config, Context>()
      if (ctx.cfg.oidc.providers == null) {
        ctx.cfg.oidc.providers = []
      }
      const providers = ctx.cfg.oidc.providers as TemporaryConfig[]
      let provider = providers.find(provider => provider.clientId === config.clientId)
      if (provider == null) {
        provider = { ...config, [_configFlag]: 0 }
        providers.push(provider)
      } else {
        provider[_configFlag]++
      }

      return provider
    },

    entityToClientId: entityId => {
      const ctx = service.assertCtx<Config, Context>()
      if (ctx.cfg.oidc.providers == null) {
        ctx.cfg.oidc.providers = []
      }
      const provider = ctx.cfg.oidc.providers.find(provider => provider.entityId === entityId)
      if (provider == null) {
        throw new AuthManagerError('oidc.client.entity-id')
      }

      return provider.clientId
    },

    unregisterTemporaryProvider: clientId => {
      const ctx = service.assertCtx<Config, Context>()
      if (ctx.cfg.oidc.providers == null) {
        ctx.cfg.oidc.providers = []
      }
      const providers = ctx.cfg.oidc.providers as TemporaryConfig[]

      clientId = typeof clientId === 'string' ? clientId : clientId.clientId
      const idx = providers.findIndex(provider => provider.clientId === clientId)
      if (idx < 0) {
        return
      }
      const provider = providers[idx]

      if (--provider[_configFlag] < 1) {
        providers.splice(idx, 1)
      }
    }
  })

  return service
}

const _configFlag = Symbol('temporary-oidc-proivder-config')
interface TemporaryConfig extends OidcProviderConfig {
  [_configFlag]: number
}
