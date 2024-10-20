import { DEF_OIDC_ACCOUNT_LINKING, DEF_OIDC_PROVIDER_API, DEFAULT_ALIAS } from './consts.js'
import { assertContext, createService } from '@owlmeans/context'
import type { AccountLinkingService, Config, Context, OidcClientService, ProviderApiService, OidcClientDescriptor, OidcClientAdapter } from './types.js'
import { AuthManagerError } from '@owlmeans/auth'
import { makeSecurityHelper } from '@owlmeans/config'
import * as client from 'openid-client'
import type { OidcProviderConfig } from '@owlmeans/oidc'
// import { URL as SrvURL } from 'node:url'

export const makeOidcClientService = (alias: string = DEFAULT_ALIAS): OidcClientService => {
  const service: OidcClientService = createService<OidcClientService>(alias, {
    getConfiguration: async clientId => {
      const context = assertContext<Config, Context>(service.ctx as Context, alias)
      let cfg = await service.getConfig(clientId)

      console.log('Client id we try: ', clientId)
      console.log('Cfg we got: ', cfg)
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

      console.log('External service url', url)

      return await client.discovery(new URL(url) as URL, clientId, cfg.secret, undefined, {
        execute: [
          // @TODO Properly handle it with the config
          client.allowInsecureRequests
        ]
      })
    },

    getClient: async clientId => {
      let descriptor: OidcClientDescriptor | null = typeof clientId === 'string' ? null : (clientId ?? null)
      let metadata = await descriptor?.serverMetadata()
      // @TODO Do not forget to delete it
      console.log('!!!! Here comes issuers meta: ', typeof clientId === 'string' ? clientId : metadata)
      let _clientId = typeof clientId === 'string' ? clientId : metadata?.issuer

      if (_clientId == null) {
        throw new AuthManagerError('oidc.client.client-id')
      }

      descriptor ??= await service.getConfiguration(_clientId)

      const cfg = await service.getConfig(_clientId)
      if (cfg?.secret == null) {
        throw new AuthManagerError('oidc.client.secert')
      }

      metadata ??= await descriptor.serverMetadata()

      // return new issuer.Client({ client_id: _clientId, client_secret: cfg?.secret })
      return {
        getMetadata: () => metadata,

        getClientId: () => _clientId,

        getConfig: () => cfg,

        makeAuthUrl: params => client.buildAuthorizationUrl(descriptor, params).toString(),

        // grantWithCredentials: async () => client.clientCredentialsGrant(descriptor, { grant_type: 'client_credentials' }),
        grantWithCredentials: async () => client.clientCredentialsGrant(descriptor),

        grantWithCode: async (url, checks, params) => {
          console.log(
            url, 
            checks,
            params
          )

          const urlObj = new URL(url)
          Object.entries(params).forEach(([key, value]) => {
            if (key === 'flow') {
              return
            }

            urlObj.searchParams.set(key, value)
          })

          checks.idTokenExpected ??= true

          // console.log(
          //   'URL Search', urlObj.toJSON()
          // )

          // const {flow, ..._params} = params
          // console.log(flow)

          console.log('Url we sent', urlObj.href)
          console.log('checks', checks)
          console.log('params', params)

          return await client.authorizationCodeGrant(
            descriptor, urlObj, checks
          )
        }, 

        refresh: async tokenSet => {
          const refreshToken = typeof tokenSet === 'string' ? tokenSet : tokenSet.refresh_token
          if (refreshToken == null) {
            throw new AuthManagerError('refresh-token')
          }
          return await client.refreshTokenGrant(descriptor, refreshToken)
        },

        introspect: async (tokenSet, type = 'access_token') =>
          await client.tokenIntrospection(descriptor, tokenSet[type] as string),

      } satisfies OidcClientAdapter
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
      console.log('We are trying to add temporary provider: ', config)
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
