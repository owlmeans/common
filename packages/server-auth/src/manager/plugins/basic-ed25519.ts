import { AuthenticationType, AuthenFailed } from '@owlmeans/auth'
import type { Context } from '@owlmeans/server-context'
import type { AuthPlugin } from './types.js'
import { assertType } from './utils.js'
import { randomBytes } from '@noble/hashes/utils'
import { base64, base64urlnopad } from '@scure/base'
import { fromPubKey } from '@owlmeans/basic-keys'

export const basicEd25519 = (context: Context): AuthPlugin => {
  const plugin: AuthPlugin = {
    type: AuthenticationType.BasicEd25519,
    init: async request => {
      assertType(request.type, plugin)

      const challenge = base64.encode(randomBytes(64))

      return { challenge }
    },

    authenticate: async credential => {
      /**
       * @TODO We need to find users in some db not just in static
       */
      const systemUser = context.cfg.trusted.find(trusted => trusted.id === credential.userId)

      if (systemUser == null) {
        throw new AuthenFailed()
      }

      if (systemUser.credential == null) {
        throw new SyntaxError('System user missconfigured')
      }

      const key = fromPubKey(systemUser.credential)

      if (!await key.verify(credential.challenge, credential.credential)) {
        throw new AuthenFailed()
      }

      const token = base64urlnopad.encode(randomBytes(64))
      return { token }
    }
  }

  return plugin
}