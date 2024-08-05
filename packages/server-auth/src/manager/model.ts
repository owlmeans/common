import type { AuthModel, AppConfig, AppContext } from './types.js'
import { AuthenFailed, AuthenPayloadError } from '@owlmeans/auth'
import type { Auth, AuthCredentials } from '@owlmeans/auth'
import { getPlugin } from './plugins/utils.js'
import { AUTH_CACHE, AUTHEN_TIMEFRAME } from '../consts.js'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { EnvelopeModel } from '@owlmeans/basic-envelope'
import { createRelyFlow } from './rely/flow.js'
import { trusted } from './utils/trusted.js'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'
import type { Resource } from '@owlmeans/resource'
import type { AuthSpent } from '../types.js'

type Config = ServerConfig
type Context = ServerContext<Config>

export const makeAuthModel = (context: AppContext<AppConfig>): AuthModel => {
  const cache = (context: Context): Resource<AuthSpent> =>
    context.resource<Resource<AuthSpent>>(AUTH_CACHE)

  const model: AuthModel = {
    init: async request => {
      const plugin = getPlugin(request.type, context)
      const response = await plugin.init(request)

      const envelope = makeEnvelopeModel(plugin.type)

      /**
       * @TODO It looks like we don't validate sourced challenge by any means
       * So we need to:
       * 1. Remove it  cause we process it as a separate property anyway
       * 2. Fix it because it looks like this separate property isn't validated
       */
      const challengeToken = request.source != null
        ? `${request.source}:${response.challenge}` : response.challenge

      const [, keyPair] = await trusted(context)
      const challenge = await envelope.send(challengeToken, AUTHEN_TIMEFRAME).sign(keyPair, EnvelopeKind.Wrap)

      return { challenge }
    },

    authenticate: async credential => {
      const [trustedUser, keyPair] = await trusted(context)
      const envelope: EnvelopeModel = makeEnvelopeModel(credential.challenge, EnvelopeKind.Wrap)
      if (!await envelope.verify(keyPair)) {
        throw new AuthenFailed('challenge')
      }

      const msg: string = envelope.message()

      // @TODO This operation is not atomic in case of redis store usage and scaling
      try {
        cache(context).create({id: msg}, {ttl: AUTHEN_TIMEFRAME / 1000})
      } catch {
        throw new AuthenFailed('challenge')
      }

      if (credential.userId == null) {
        throw new AuthenPayloadError('userId')
      }

      const plugin = getPlugin(envelope.type(), context)

      // @TODO this token PROBABLY needs to be registered somewhere and rechecked
      // from time to time to make sure that the session is not deleted 
      // or permission hasn't changed.
      // Alternative solution is to have permissions cached and cleaned 
      // when some broadcast message is sent from authentication system.

      const challenge = credential.challenge
      const { token } = await plugin.authenticate(Object.assign(credential, { challenge: msg }))
      credential.challenge = token === '' ? challenge : token

      credential.credential = trustedUser.id

      return {
        token: await makeEnvelopeModel<Auth | AuthCredentials>(credential.type)
          .send(credential, AUTHEN_TIMEFRAME)
          .sign(keyPair, EnvelopeKind.Token)
      }
    },

    rely: async (conn, auth) => {
      conn.authenticate = createRelyFlow(context, conn, auth)
    }
  }

  return model
}
