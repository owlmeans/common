import { DEFAULT_ALIAS } from './consts.js'
import { assertContext, createService } from '@owlmeans/context'
import type { Config, Context, OidcClientService } from './types.js'
import { AuthManagerError } from '@owlmeans/auth'
import { makeSecurityHelper } from '@owlmeans/config'
import { custom, Issuer } from 'openid-client'

export const makeOidcClientService = (alias: string = DEFAULT_ALIAS): OidcClientService => {
  const service: OidcClientService = createService<OidcClientService>(alias, {
    getIssuer: async clientId => {
      const context = assertContext<Config, Context>(service.ctx as Context, alias)
      const cfg = context.cfg.oidc.consumer
      clientId = clientId ?? cfg?.clientId

      if (cfg?.basePath == null) {
        throw new AuthManagerError('oidc.client.basepath')
      }

      if (cfg.service == null) {
        throw new AuthManagerError('oidc.client.service')
      }

      const security = makeSecurityHelper<Config, Context>(context)
      const serviceManager = context.cfg.services[cfg.service]

      const url = security.makeUrl(serviceManager, cfg.basePath)

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
      const context = assertContext<Config, Context>(service.ctx as Context, alias)
      const cfg = context.cfg.oidc.consumer
      const issuer: Issuer = typeof clientId === 'string' || clientId == null
        ? await service.getIssuer(clientId) : clientId

      let _clientId = cfg?.clientId
      if (typeof clientId !== 'object' && clientId != null) {
        _clientId = clientId
      }

      if (_clientId == null) {
        throw new AuthManagerError('oidc.client.client-id')
      }

      const secret = context.cfg.oidc.consumerSecrets?.clientSecret
      if (secret == null) {
        throw new AuthManagerError('oidc.client.secert')
      }

      return new issuer.Client({ client_id: _clientId, client_secret: secret })
    }
  }, service => async () => {
    service.initialized = true
  })

  return service
}
