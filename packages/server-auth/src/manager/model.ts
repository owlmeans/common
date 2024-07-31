import type { AuthModel, AppConfig, AppContext } from './types.js'
import { AuthenFailed, AuthenPayloadError } from '@owlmeans/auth'
import { getPlugin } from './plugins/utils.js'
import { AUTH_SRV_KEY, AUTHEN_TIMEFRAME } from '../consts.js'
import type { KeyPairModel } from '@owlmeans/basic-keys'
import { makeKeyPairModel } from '@owlmeans/basic-keys'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { EnvelopeModel } from '@owlmeans/basic-envelope'
import { TRUSTED } from '@owlmeans/server-context'
import type { TrustedRecord } from '@owlmeans/server-context'

export const makeAuthModel = (context: AppContext<AppConfig>): AuthModel => {
  let _trustedUser: TrustedRecord | null = null
  let _keyPair: KeyPairModel | null = null
  const trusted = async (): Promise<[TrustedRecord, KeyPairModel]> => {
    if (_trustedUser == null) {

      const trustedUser = await context.getConfigResource(TRUSTED).load<TrustedRecord>(AUTH_SRV_KEY, "name")
      if (trustedUser == null || trustedUser.secret == null) {
        throw new SyntaxError(`Auth service trusted entity secret not provided: ${AUTH_SRV_KEY}`)
      }

      _trustedUser = trustedUser
      _keyPair = makeKeyPairModel(trustedUser.secret)
    }

    return [_trustedUser, _keyPair!]
  }

  const model: AuthModel = {
    init: async request => {
      const plugin = getPlugin(request.type, context)
      const response = await plugin.init(request)

      const envelope = makeEnvelopeModel(plugin.type)

      const challengeToken = request.source != null
        ? `${request.source}:${response.challenge}` : response.challenge

      const [, keyPair] = await trusted()
      const challenge = await envelope.send(challengeToken, AUTHEN_TIMEFRAME).sign(keyPair, EnvelopeKind.Wrap)

      return { challenge }
    },

    authenticate: async credential => {
      const [trustedUser, keyPair] = await trusted()
      const envelope: EnvelopeModel = makeEnvelopeModel(credential.challenge, EnvelopeKind.Wrap)
      if (!await envelope.verify(keyPair)) {
        throw new AuthenFailed('challenge')
      }

      const msg: string = envelope.message()

      // @TODO This operation is not atomic in case of redis store usage and scaling
      if (store.has(msg)) {
        throw new AuthenFailed('challenge')
      }
      store.add(msg)

      // Clean up expired challenges
      setTimeout(() => {
        store.delete(msg)

        console.log('Clean up challenge lock: ' + credential.challenge)
      }, AUTHEN_TIMEFRAME) // @TODO It lives longer than it's lifetime

      if (credential.userId == null) {
        throw new AuthenPayloadError('userId')
      }

      const plugin = getPlugin(envelope.type(), context)

      // @TODO this token PROBABLY needs to be registered somewhere and rechecked
      // from time to time to make sure that the session is not deleted 
      // or permission hasn't changed.
      // Alternative solution is to have permissions cached and cleaned 
      // when some broadcast message is sent from authentication system.
      await plugin.authenticate(credential)

      credential.credential = trustedUser.id

      return {
        token: await makeEnvelopeModel(credential.type)
          .send(credential, AUTHEN_TIMEFRAME)
          .sign(keyPair, EnvelopeKind.Token)
      }
    }
  }

  return model
}

// @TODO It doesn't scale - use redis or sticky sessions
const store = new Set<string>()
