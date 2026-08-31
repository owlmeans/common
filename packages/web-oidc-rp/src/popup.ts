import {
  adoptToken, clearSurrogate, isEmbedded, isSurrogate, markSurrogate,
  LOGIN_TOKEN_MESSAGE,
} from '@owlmeans/client-auth/login'
import type { AppConfig, AppContext } from '@owlmeans/web-client'
import { LoginOutcome } from '@owlmeans/client-auth/login'

/**
 * Compatibility surface for the framed-login helpers.
 *
 * The mechanics they used to implement now live in the login-plugin host
 * (`@owlmeans/client-auth/login`) and the browser plugins that `@owlmeans/web-client` registers,
 * so a relying party no longer has to know about frames, popups or storage partitions to support
 * them. These are kept, and kept working, because a generated target app carries a COPY of the
 * code that calls them: a template fix reaches new projects only, and the ones already running
 * must not break under a framework upgrade.
 *
 * New code should use `context.login()` and `useLogin()` instead.
 */

/** @deprecated Read `LoginEnv.embedded` from the login service, or let a plugin's `match` decide. */
export const isFramed = isEmbedded

/** @deprecated The surrogate plugin records this in its `enter` stage. */
export const markOidcLoginPopup = markSurrogate

/** @deprecated Read `LoginEnv.surrogate` from the login service. */
export const isOidcLoginPopup = isSurrogate

/** @deprecated Use `context.login().adopt(token)` — the single token-adoption path. */
export const applyAuthToken = async <C extends AppConfig, T extends AppContext<C>>(
  context: T, token: string
): Promise<void> => { await adoptToken(context, token) }

/** @deprecated Use `context.login().complete(token)`. */
export const handBackOidcToken = (token: string | null | undefined): boolean => {
  if (!isSurrogate() || window.opener == null || token == null || token === '') {
    return false
  }
  clearSurrogate()
  window.opener.postMessage({ type: LOGIN_TOKEN_MESSAGE, token }, window.location.origin)
  window.close()

  return true
}

/** @deprecated Use `context.login().begin({ url })`. */
export const loginViaPopup = async <C extends AppConfig, T extends AppContext<C>>(
  context: T, dispatcherUrl: string
): Promise<boolean> =>
  await context.login().begin({ url: dispatcherUrl }) === LoginOutcome.Handled
