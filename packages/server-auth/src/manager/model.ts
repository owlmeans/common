import type { Context } from '@owlmeans/server-context'
import type { AuthModel } from './types.js'
import { AuthenFailed, AuthenPayloadError } from '@owlmeans/auth'
import type { AllowanceEnvelope } from '@owlmeans/auth'
import { getPlugin } from './plugins/utils.js'
import { AUTHEN_TIMEFRAME } from '../consts.js'
import { makeKeyPairModel } from '@owlmeans/basic-keys'
import { base64, utf8 } from '@scure/base'

// @TODO Use some keypair from configuration to 
// make it possible to scale this service
const _keyPair = makeKeyPairModel()

export const makeAuthModel = (context: Context): AuthModel => {
  const model: AuthModel = {
    init: async (request) => {
      const plugin = getPlugin(request.type, context)
      const response = await plugin.init(request)

      const date = new Date().toISOString()
      const signature = _keyPair.sign({ t: plugin.type, msg: response.challenge, dt: date })

      const challenge = base64.encode(utf8.decode(JSON.stringify({
        t: plugin.type,
        msg: response.challenge,
        dt: date,
        sig: signature
      })))

      return { challenge }
    },

    authenticate: async (credential) => {
      const envelope: AllowanceEnvelope = JSON.parse(utf8.encode(base64.decode(credential.challenge)))
      if (new Date(envelope.dt).getTime() + AUTHEN_TIMEFRAME < new Date().getTime()) {
        throw new AuthenFailed('challenge')
      }
      if (envelope.sig == null) {
        throw new AuthenFailed('challenge')
      }
      if (!await _keyPair.verify({ t: envelope.t, msg: envelope.msg, dt: envelope.dt }, envelope.sig)) {
        throw new AuthenFailed('challenge')
      }

      // @TODO This operation is not atomic in case of redis store usage and scling
      if (store.has(envelope.msg)) {
        throw new AuthenFailed('challenge')
      }
      store.add(envelope.msg)

      // Clean up expired challenges
      setTimeout(() => {
        store.delete(envelope.msg)

        console.log('Clean up challenge: ' + credential.challenge)
      }, AUTHEN_TIMEFRAME) // @TODO It lives longer than it's lifetime

      if (credential.userId == null) {
        throw new AuthenPayloadError('userId')
      }

      const plugin = getPlugin(envelope.t, context)
      const token = await plugin.authenticate({ ...credential, challenge: envelope.msg })

      console.log('Onetime token prepared')

      return token
    }
  }

  return model
}

const store = new Set<string>()
