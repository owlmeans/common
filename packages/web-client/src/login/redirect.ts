import { LoginOutcome } from '@owlmeans/client-auth/login'
import type { LoginPlugin } from '@owlmeans/client-auth/login'
import { REDIRECT_LOGIN } from './consts.js'

/**
 * The ordinary login flow: this document leaves for the identity provider and comes back.
 *
 * The default plugin, matching everything, so any environment that does not need special handling
 * behaves exactly as it always did.
 */
export const makeRedirectLoginPlugin = (): LoginPlugin => ({
  alias: REDIRECT_LOGIN,
  priority: 0,
  mode: 'redirect',
  match: () => true,

  begin: async (_ctx, request) => {
    // Prefer the in-app continuation the caller handed over: a client-side navigation to the
    // dispatcher keeps the app mounted, where a full page load would tear it down and rebuild it.
    if (request.navigate != null) {
      await request.navigate()

      return LoginOutcome.Handled
    }
    window.location.href = request.url

    return LoginOutcome.Redirected
  },

  authorize: async (_ctx, url) => {
    window.location.href = url

    return LoginOutcome.Redirected
  },

  // Nothing to hand anywhere — the token was issued in the document that will use it.
  complete: async () => LoginOutcome.Passed,
})
