import { AuthenticationType, AuthenFailed, ALL_SCOPES, AuthRole } from '@owlmeans/auth'
import type { AuthPlugin } from './types.js'
import { assertType } from './utils.js'
import { randomBytes } from '@noble/hashes/utils'
import { base64 } from '@scure/base'
import { fromPubKey } from '@owlmeans/basic-keys'
import type { AppConfig, AppContext } from '../types.js'
import { TRUSTED } from '@owlmeans/server-context'
import type { TrustedRecord } from '@owlmeans/auth-common'

export const basicEd25519 = <C extends AppConfig, T extends AppContext<C>>(context: T): AuthPlugin => {
  const plugin: AuthPlugin = {
    type: AuthenticationType.BasicEd25519,
    init: async request => {
      assertType(request.type, plugin)

      const challenge = base64.encode(randomBytes(32))

      return { challenge }
    },

    authenticate: async credential => {
      /**
       * @TODO We need to find users in some db not just in static
       */
      const systemUser = await context.getConfigResource(TRUSTED)
        .load<TrustedRecord>(credential.userId)

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

      const token = base64.encode(randomBytes(32))

      // @TODO we need to do something with scopes - it's not secure
      credential.scopes = [ALL_SCOPES]
      credential.role = AuthRole.Superuser
      credential.challenge = token
      credential.type = AuthenticationType.OneTimeToken

      return { token }
    }
  }

  return plugin
}
