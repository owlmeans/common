import type { Context } from '@owlmeans/server-context'
import type { AuthModel } from './types.js'
import { ALL_SCOPES, AuthenFailed, AuthenPayloadError, AuthenticationType, AuthRole } from '@owlmeans/auth'
import { getPlugin } from './plugins/utils.js'
import { AUTH_SRV_KEY, AUTHEN_TIMEFRAME } from '../consts.js'
import { makeKeyPairModel } from '@owlmeans/basic-keys'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import type { EnvelopeModel } from '@owlmeans/basic-envelope'

export const makeAuthModel = (context: Context): AuthModel => {
  const trustedUser = context.cfg.trusted.find(trusted => trusted.name === AUTH_SRV_KEY)
  if (trustedUser == null || trustedUser.secret == null) {
    throw new SyntaxError(`Auth service trusted entity secret not provided: ${AUTH_SRV_KEY}`)
  }

  const _keyPair = makeKeyPairModel(trustedUser.secret)

  const model: AuthModel = {
    init: async (request) => {
      const plugin = getPlugin(request.type, context)
      const response = await plugin.init(request)

      const envelope = makeEnvelopeModel(plugin.type)

      const challenge = await envelope.send(response.challenge, AUTHEN_TIMEFRAME).sign(_keyPair, EnvelopeKind.Wrap)

      return { challenge }
    },

    authenticate: async (credential) => {
      const envelope: EnvelopeModel = makeEnvelopeModel(credential.challenge, EnvelopeKind.Wrap)
      if (!await envelope.verify(_keyPair)) {
        throw new AuthenFailed('challenge')
      }

      const msg: string = envelope.message()

      // @TODO This operation is not atomic in case of redis store usage and scling
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
      const { token } = await plugin.authenticate({ ...credential, challenge: msg })

      credential.challenge = token
      credential.credential = trustedUser.id

      // @TODO we need to do something with scopes - it's not secure
      credential.scopes = [ALL_SCOPES]
      credential.role = AuthRole.Superuser

      return {
        token: await makeEnvelopeModel(AuthenticationType.OneTimeToken).send(credential, AUTHEN_TIMEFRAME)
          .sign(_keyPair, EnvelopeKind.Token)
      }
    }
  }

  return model
}

const store = new Set<string>()
