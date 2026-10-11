import { AUTH_SCOPE, AuthenticationType, AuthRole, GUEST_ID, MOD_RECAPTCHA } from '@owlmeans/auth'
import type { AuthCredentials } from '@owlmeans/auth'
import { PLUGINS, PluginMissconfigured } from '@owlmeans/config'
import { base64 } from '@scure/base'
import { randomBytes } from '@noble/hashes/utils.js'
import type { AppContext, AppConfig } from '../types.js'
import type { AuthPlugin } from './types.js'
import { authPluginHelper } from './utils.js'
import { RECAPTCHA_VERIFIER } from './re-captcha/consts.js'
import { RECAPTCHA_CREDENTIAL_FIELDS } from './re-captcha/consts.local.js'
import { makeReCaptchaPolicyModel } from './re-captcha/policy.js'
import { createReCaptchaVerifierService } from './re-captcha/verifier.js'
import type { ReCaptchaPluginConfig, ReCaptchaPolicyModel, ReCaptchaVerifierService } from './re-captcha/types.js'

/**
 * The reCAPTCHA sign-in: proves that a person solved a challenge, and nothing about who they are.
 *
 * The token the manager signs for it is a GUEST credential — `GUEST_ID`, role Guest, `[AUTH_SCOPE]`,
 * type ReCaptcha — whatever identity the caller posted: a profile, an organization, permissions,
 * groups, an expiry and a `source` are dropped before it is signed. Its single-use key is the
 * server-issued challenge it carries. A route accepts it only through `makeReCaptchaGuard`; the
 * bearer exchange refuses it.
 */
export const makeReCaptchaPlugin = <C extends AppConfig, T extends AppContext<C>>(context: T): AuthPlugin => {
  const verifier = (): ReCaptchaVerifierService => context.hasService(RECAPTCHA_VERIFIER)
    ? context.service<ReCaptchaVerifierService>(RECAPTCHA_VERIFIER)
    : createReCaptchaVerifierService()

  /** The secret and the policy of the `MOD_RECAPTCHA` record; no secret = no reCAPTCHA sign-in. */
  const configured = async (): Promise<[string, ReCaptchaPolicyModel]> => {
    const record = await context.getConfigResource<ReCaptchaPluginConfig>(PLUGINS).load(MOD_RECAPTCHA)
    if (record == null || typeof record.value !== 'string' || record.value === '') {
      throw new PluginMissconfigured('value')
    }

    return [record.value, makeReCaptchaPolicyModel(record)]
  }

  const resetIdentity = (credential: AuthCredentials): void => {
    const fields = credential as unknown as Record<string, unknown>
    for (const field of Object.keys(fields)) {
      if (!RECAPTCHA_CREDENTIAL_FIELDS.includes(field)) {
        delete fields[field]
      }
    }
    credential.type = AuthenticationType.ReCaptcha
    credential.role = AuthRole.Guest
    credential.userId = GUEST_ID
    credential.scopes = [AUTH_SCOPE]
  }

  const plugin: AuthPlugin = {
    type: AuthenticationType.ReCaptcha,

    init: async request => {
      authPluginHelper.assertType(request.type, plugin)

      return { challenge: base64.encode(randomBytes(32)) }
    },

    authenticate: async credential => {
      const [secret, policy] = await configured()
      // Read before the policy is judged: a misconfigured record fails before Google is asked.
      policy.minScore()

      const answer = await verifier().verify({ secret, response: credential.credential })
      policy.assert(answer)

      resetIdentity(credential)

      // '' keeps the manager's own server-issued challenge on the token: that is its spend key.
      return { token: '' }
    }
  }

  return plugin
}
