import { AuthenticationType, AuthenFailed, ALL_SCOPES, AuthRole } from '@owlmeans/auth'
import type { AuthPlugin } from './types.js'
import { assertType } from './utils.js'
import { randomBytes } from '@noble/hashes/utils'
import { base64 } from '@scure/base'
import { fromPubKey } from '@owlmeans/basic-keys'
import type { AppContext, AppConfig } from '../types.js'
import { TRUSTED } from '@owlmeans/server-context'
import type { TrustedRecord } from '@owlmeans/server-context'

export const basicEd25519 = (context: AppContext<AppConfig>): AuthPlugin => {
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
      const systemUser = await context.getConfigResource(TRUSTED).load<TrustedRecord>(credential.userId)

      if (systemUser == null) {
        throw new AuthenFailed()
      }

      if (systemUser.credential == null) {
        throw new SyntaxError('System user missconfigured')
      }

      const key = fromPubKey(systemUser.credential)

      if (!await key.verify(credential.challenge, credential.credential)) {
        throw new AuthenFailed(`challenge:${plugin.type}`)
      }

      const token = base64.encode(randomBytes(64))

      // @TODO we need to do something with scopes - it's not secure
      credential.scopes = [ALL_SCOPES]
      credential.role = AuthRole.Superuser
      credential.challenge = token
      credential.type = AuthenticationType.OneTimeToken

      return { token: token }
    }
  }

  return plugin
}
