import { AUTH_SCOPE, AuthenticationType, AuthRole, GUEST_ID } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'
import { captchaResolverOf, makeCaptchaPolicyModel } from '@owlmeans/captcha'
import type { CaptchaPolicyModel, CaptchaProvider } from '@owlmeans/captcha'
import { PluginMissconfigured } from '@owlmeans/config'
import { base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils.js'
import type { AppContext, AppConfig } from '../types.js'
import type { AuthPlugin } from './types.js'
import { authPluginHelper } from './utils.js'
import { CAPTCHA_CREDENTIAL_FIELDS } from './captcha/consts.local.js'

/**
 * The captcha sign-in: proves that a person solved a challenge, and nothing about who they are.
 *
 * It is on only where the config declares the `MOD_CAPTCHA` host record (`@owlmeans/captcha`): the
 * record names the provider that judges the token — a provider registered in the context's captcha
 * host — and states the lenient policy. Without the record, or without its provider, nobody is
 * admitted; there is no built-in provider to fall back to.
 *
 * The token the manager signs for it is a GUEST credential — `GUEST_ID`, role Guest, `[AUTH_SCOPE]`,
 * type Captcha — whatever identity the caller posted: a profile, an organization, permissions,
 * groups, an expiry and a `source` are dropped before it is signed. Its single-use key is the
 * server-issued challenge it carries. A route accepts it only through `makeCaptchaGuard`; the bearer
 * exchange refuses it.
 */
export const makeCaptchaPlugin = <C extends AppConfig, T extends AppContext<C>>(context: T): AuthPlugin => {
  const resolver = captchaResolverOf(context)

  /** The provider and the policy of the `MOD_CAPTCHA` record; no record = no captcha sign-in. */
  const configured = (): [CaptchaProvider, CaptchaPolicyModel] => {
    const record = resolver.record()
    if (record == null) {
      throw new PluginMissconfigured('captcha')
    }

    return [resolver.provider(record.provider), makeCaptchaPolicyModel(record)]
  }

  const resetIdentity = (credential: AuthCredentials): void => {
    const fields = credential as unknown as Record<string, unknown>
    for (const field of Object.keys(fields)) {
      if (!CAPTCHA_CREDENTIAL_FIELDS.includes(field)) {
        delete fields[field]
      }
    }
    credential.type = AuthenticationType.Captcha
    credential.role = AuthRole.Guest
    credential.userId = GUEST_ID
    credential.scopes = [AUTH_SCOPE]
  }

  const plugin: AuthPlugin = {
    type: AuthenticationType.Captcha,

    init: async request => {
      authPluginHelper.assertType(request.type, plugin)

      return { challenge: base64.encode(randomBytes(32)) }
    },

    authenticate: async credential => {
      const [provider, policy] = configured()
      // Read before the policy is judged: a misconfigured record fails before the provider is asked.
      policy.minScore()

      const verdict = await provider.verify(credential.credential)
      policy.assert(verdict)

      resetIdentity(credential)

      // '' keeps the manager's own server-issued challenge on the token: that is its spend key.
      return { token: '' }
    }
  }

  return plugin
}
