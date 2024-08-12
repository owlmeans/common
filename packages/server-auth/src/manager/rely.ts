import { assertContext, createService } from '@owlmeans/context'
import { DEFAULT_RELY } from './consts.js'
import type { RelyService } from './types.js'
import { AUTH_QUERY, AuthenFailed, AuthenticationType } from '@owlmeans/auth'
import type { Auth, AuthCredentials, AuthToken } from '@owlmeans/auth'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/module'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { ServerConfig, ServerContext, TrustedRecord } from '@owlmeans/server-context'
import { TRUSTED } from '@owlmeans/server-context'
import { AUTH_CACHE, AUTH_SRV_KEY, AUTHEN_TIMEFRAME } from '../consts.js'
import { makeKeyPairModel } from '@owlmeans/basic-keys'
import type { AuthSpent } from '../types.js'
import type { Resource } from '@owlmeans/resource'

type Config = ServerConfig
type Context = ServerContext<Config>

export const createRelyService = (alias: string = DEFAULT_RELY): RelyService => {
  const _keyPair = async (context: Context) => {
    const trustedUser = await context.getConfigResource(TRUSTED).load<TrustedRecord>(AUTH_SRV_KEY, "name")
    if (trustedUser == null || trustedUser.secret == null) {
      throw new SyntaxError(`Auth service trusted entity secret not provided: ${AUTH_SRV_KEY}`)
    }

    return makeKeyPairModel(trustedUser.secret)
  }

  const service: RelyService = createService<RelyService>(alias, {
    match: async (req: AbstractRequest<AuthToken>) => {
      const authorization: string | null = req.query[AUTH_QUERY] != null
        ? `${req.query[AUTH_QUERY]}` : null

      if (authorization == null) {
        // This is optional Guard. So it can not match only on provided authorization
        // that is not valid. In other cases it's passed and need to be handled 
        // to provide or null authentication object.
        return true
      }

      const token = makeEnvelopeModel<Auth>(authorization, EnvelopeKind.Token)
      const auth = token.message()

      return auth.type === AuthenticationType.OneTimeToken ?? false
    },

    handle: async <T>(req: AbstractRequest<AuthToken>, res: AbstractResponse<Auth>) => {
      const context = assertContext<Config, Context>(service.ctx as Context)
      const authorization = req.query[AUTH_QUERY]
      // We authorize in cases when there is no authorization or it's valid one
      if (authorization == null) {
        return true as T
      }

      // @TODO it's likely something is wrong with AbstractRequest types - so it should be fixed there
      if (typeof authorization !== 'string') {
        return false as T
      }

      const envelope = makeEnvelopeModel<AuthCredentials>(authorization, EnvelopeKind.Token)

      if (!await envelope.verify(await _keyPair(context))) {
        return false as T
      }

      const msg = envelope.message()
      if (msg.source !== AuthenticationType.WalletDid) {
        return false as T
      }

      try {
        const cache = (context: Context): Resource<AuthSpent> =>
          context.resource<Resource<AuthSpent>>(AUTH_CACHE)

        await cache(context).create({ id: msg.challenge }, { ttl: (envelope.envelope.ttl ?? AUTHEN_TIMEFRAME) / 1000 })
      } catch (e) {
        const error = new AuthenFailed('challenge')
        if (e instanceof Error) {
          error.oiriginalStack = `${e} : ${e.stack}`
        }
        throw error
      }

      // @TODO Actually there is some mess. We know that it aint Auth but AuthCredentials
      res.resolve(msg as unknown as Auth)

      return true as T
    }
  }, service => async () => { service.initialized = true })

  return service
}
