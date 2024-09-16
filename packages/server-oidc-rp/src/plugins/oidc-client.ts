
import type { AuthPlugin } from '@owlmeans/server-auth/manager/plugins'
import type { AppConfig, AppContext } from '@owlmeans/server-auth/manager'
import type { OidcClientService } from '../types.js'
import { assertType } from '@owlmeans/server-auth/manager/plugins'
import { DEFAULT_ALIAS } from '../consts.js'
import { OIDC_CLIENT_AUTH } from '@owlmeans/oidc'
import { base64urlnopad as base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'
import { sha256 } from '@noble/hashes/sha256'

export const oidcClientPlugin = <C extends AppConfig, T extends AppContext<C>>(context: T): AuthPlugin => {
  const plugin: AuthPlugin = {
    type: OIDC_CLIENT_AUTH,

    init: async request => {
      assertType(request.type, plugin)

      const challenge = base64.encode(sha256(randomBytes(32)))

      console.log('Challenge: ', challenge)
      console.log(request)

      const oidc = context.service<OidcClientService>(DEFAULT_ALIAS)

      const client = await oidc.getClient()

      const url = client.authorizationUrl({
        code_challenge: challenge,
        code_challenge_method: 'S256',
        redirect_uri: request.source
      })

      return { challenge: url }
    },

    authenticate: async _credential => {

      return { token: '' }
    }
  }

  return plugin
}
