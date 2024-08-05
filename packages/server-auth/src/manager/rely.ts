import { createService } from '@owlmeans/context'
import { DEFAULT_RELY } from './consts.js'
import type { RelyService } from './types.js'
import { AUTH_QUERY, AuthenticationType, AuthroizationType } from '@owlmeans/auth'
import type { Auth, AuthToken } from '@owlmeans/auth'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/module'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import { AUTH_SRV_KEY } from '../consts.js'
import { makeKeyPairModel } from '@owlmeans/basic-keys'

type Config = ServerConfig
type Context = ServerContext<Config>

export const createRelyService = (alias: string = DEFAULT_RELY): RelyService => {
  const _keyPair = (context: Context) => {
    const trustedUser = context.cfg.trusted.find(trusted => trusted.name === context.cfg.service)
    if (trustedUser == null || trustedUser.secret == null) {
      throw new SyntaxError(`Auth service trusted entity secret not provided: ${AUTH_SRV_KEY}`)
    }

    return makeKeyPairModel(trustedUser.secret)
  }

  const service: RelyService = createService<RelyService>(alias, {
    match: async (req: AbstractRequest<AuthToken>) => {
      const authorization: string | null = req.query[AUTH_QUERY] != null
        ? `${req.query[AUTH_QUERY]}` : null

      return authorization?.startsWith(AuthroizationType.Ed25519BasicToken.toUpperCase())
        ?? false
    },

    handle: async <T>(req: AbstractRequest<AuthToken>, res: AbstractResponse<Auth>) => {
      const authorization = req.query[AUTH_QUERY]
      if (typeof authorization !== 'string') {
        return false as T
      }

      const envelope = makeEnvelopeModel<Auth>(authorization, EnvelopeKind.Token)

      if (!await envelope.verify(_keyPair(service.ctx as Context))) {
        return false as T
      }

      const msg = envelope.message()
      if (msg.source !== AuthenticationType.WalletDid) {
        return false as T
      }

      res.resolve(msg)

      return true as T
    }
  }, service => async () => { service.initialized = true })

  return service
}
