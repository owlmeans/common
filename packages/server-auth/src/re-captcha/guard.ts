import { AUTH_SCOPE, AuthenticationType, AuthRole, GUEST_ID, RECAPTCHA_GUARD } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { extractAuthToken } from '@owlmeans/auth-common/utils'
import { createService } from '@owlmeans/context'
import type { AbstractRequest, AbstractResponse, GuardService } from '@owlmeans/entrypoint'
import type { Config, Context } from '../types.local.js'
import { reCaptchaTokenOf } from './token.js'

/**
 * The guard of a route a reCAPTCHA-proven guest may call once (`RECAPTCHA_GUARD`):
 * `Authorization: RE-CAPTCHA <token>`, the token the auth manager's reCAPTCHA plugin issued.
 *
 * Every check of `ReCaptchaTokenHelper.inspect`, then the spend — a token admits one request. The
 * request's `auth` is a guest (`GUEST_ID`, role Guest, `[AUTH_SCOPE]`, type ReCaptcha) with an empty
 * `token`: whatever reads an authorization downstream may log it. A refused token is no credential at
 * all, so the request is unauthenticated (401).
 */
export const makeReCaptchaGuard = (alias: string = RECAPTCHA_GUARD): GuardService => {
  const service: GuardService = createService<GuardService>(alias, {
    match: async req => req != null && extractAuthToken(req, AuthenticationType.ReCaptcha) != null,

    handle: async <T>(req: AbstractRequest, res: AbstractResponse<Auth>) => {
      const context = service.assertCtx<Config, Context>()
      const tokens = reCaptchaTokenOf(context)

      const guest = await tokens.inspect(req)
      if (guest == null || !await tokens.spend(guest)) {
        return false as T
      }

      const auth: Auth = {
        token: '',
        type: AuthenticationType.ReCaptcha,
        role: AuthRole.Guest,
        userId: GUEST_ID,
        scopes: [AUTH_SCOPE],
        isUser: false,
        source: context.cfg.service,
        createdAt: new Date(),
        expiresAt: guest.expiresAt,
      }
      res.resolve(auth)

      return true as T
    },

    /** Server-side guard: it verifies what arrives, it never produces a credential. */
    authenticated: async () => null,
  })

  return service
}
