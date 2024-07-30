import { AuthenFailed, AuthenticationType, AuthPluginError, MOD_RECAPTCHA, AUTH_SCOPE, AuthRole } from '@owlmeans/auth'
import type { AppContext, AppConfig } from '../types.js'
import type { AuthPlugin, RecaptchaRequest, RecpatchaResponse } from './types.js'
import { PLUGINS } from '@owlmeans/server-context'
import type { PluginConfig } from '@owlmeans/config'
import { PluginMissconfigured } from '@owlmeans/config'
import type { ClientModule } from '@owlmeans/client-module'
import { ModuleOutcome } from '@owlmeans/module'
import { base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils'
import { assertType } from './utils.js'
import { AUTHEN_TIMEFRAME } from '../../consts.js'

export const reCaptcha = (context: AppContext<AppConfig>): AuthPlugin => {
  const plugin: AuthPlugin = {
    type: AuthenticationType.ReCaptcha,

    init: async request => {
      assertType(request.type, plugin)

      const challenge = base64.encode(randomBytes(64))

      store.add(challenge)
      setTimeout(() => store.delete(challenge), AUTHEN_TIMEFRAME / 2)

      return { challenge }
    },

    authenticate: async credential => {
      if (!store.delete(credential.challenge)) {
        throw new AuthenFailed('timeout')
      }
      const cfg = context.getConfigResource(PLUGINS)
      const config = await cfg.get<PluginConfig>(MOD_RECAPTCHA)
      if (config.value == null) {
        throw new PluginMissconfigured('value')
      }
      const validateRecaptcha = context.module<ClientModule<RecpatchaResponse>>(MOD_RECAPTCHA)
      const [result, status] = await validateRecaptcha.call<RecpatchaResponse, RecaptchaRequest>({
        body: {
          secret: config.value,
          response: credential.credential
        },
        headers: { 'content-type': 'application/x-www-form-urlencoded' }
      })
      if (status !== ModuleOutcome.Ok) {
        throw new AuthPluginError('recaptcha:api')
      }
      if (!result.success) {
        throw new AuthenFailed('recaptcha:' + result['error-codes']?.join(',') ?? 'unknown')
      }

      const token = base64.encode(randomBytes(64))

      credential.scopes = [AUTH_SCOPE]
      credential.role = AuthRole.Guest
      credential.challenge = token

      return { token }
    }
  }

  return plugin
}

// @TODO It doesn't scale - use redis or sticky sessions
const store = new Set<string>()
