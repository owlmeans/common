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

      /**
       * @TODO It looks like we don't validate sourced challenge by any means
       * So we need to:
       * 1. Remove it  cause we process it as a separate property anyway
       * 2. Fix it because it looks like this separate property isn't validated
       */
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

      const challenge = credential.challenge
      const { token } = await plugin.authenticate(Object.assign(credential, { challenge: msg }))
      credential.challenge = token === '' ? challenge : token

      credential.credential = trustedUser.id

      return {
        token: await makeEnvelopeModel(credential.type)
          .send(credential, AUTHEN_TIMEFRAME)
          .sign(keyPair, EnvelopeKind.Token)
      }
    },

    rely: async (conn, _source) => {
      // const authenticate = conn.authenticate
      
      conn.authenticate = async (stage, payload) => {
        // 1. There is a difference between privileged (provider)
        //    and non-privileged (consumer) request 
        // 2. Source allows to distinguish between provider and consumer
        //    but probably it needs to be universalized some way
        //    cause potentially wallet can also be consumer
        //    (right now consumer will request authentication type)
        // 3. General idea is that: when you are connected, the auth
        //    process can be started from scratch following same stages
        //    and using the same plugins but via socket
        // We start implemnetation of ProviderHandshake / ConsumerHandshake here:
        // 4. Our firs objective right now is to just establish one request
        //    connection betwee provider and consumer: ProviderHandshake / ConsumerHandshake
        // 5. It should lead to WalletProvider / WalletConsumer authentication,
        //    that will be used by consumer for one time signature
        // 6. So as outcome is transformation of this connection to one-time
        //    signature / action provider schema.
        return [stage, payload as any]
      }
    }
  }

  return model
}

// @TODO It doesn't scale - use redis or sticky sessions
const store = new Set<string>()
