import { AUTH_SCOPE, AuthenticationType, AuthRole, CAPTCHA_GUARD, GUEST_ID } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import { extractAuthToken } from '@owlmeans/auth-common/utils'
import { captchaResolverOf } from '@owlmeans/captcha'
import { createService } from '@owlmeans/context'
import type { AbstractRequest, AbstractResponse, GuardService } from '@owlmeans/entrypoint'
import type { Config, Context } from '../types.local.js'
import { captchaTokenOf } from './token.js'

/**
 * The guard of a route a captcha-proven guest may call once (`CAPTCHA_GUARD`):
 * `Authorization: CAPTCHA <token>`, the token the auth manager's captcha plugin issued.
 *
 * Every check of `CaptchaTokenHelper.inspect`, then the spend — a token admits one request. The
 * request's `auth` is a guest (`GUEST_ID`, role Guest, `[AUTH_SCOPE]`, type Captcha) with an empty
 * `token`: whatever reads an authorization downstream may log it. A refused token is no credential at
 * all, so the request is unauthenticated (401).
 *
 * At boot it checks what the captcha sign-in beside it needs: a declared `MOD_CAPTCHA` record must
 * name a registered captcha provider, or the context does not start.
 */
export const makeCaptchaGuard = (alias: string = CAPTCHA_GUARD): GuardService => {
  const service: GuardService = createService<GuardService>(alias, {
    match: async req => req != null && extractAuthToken(req, AuthenticationType.Captcha) != null,

    handle: async <T>(req: AbstractRequest, res: AbstractResponse<Auth>) => {
      const context = service.assertCtx<Config, Context>()
      const tokens = captchaTokenOf(context)

      const guest = await tokens.inspect(req)
      if (guest == null || !await tokens.spend(guest)) {
        return false as T
      }

      const auth: Auth = {
        token: '',
        type: AuthenticationType.Captcha,
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
  }, guard => async () => {
    captchaResolverOf(guard.assertCtx<Config, Context>()).assertReady()
    guard.initialized = true
  })

  return service
}
