import {
  adoptToken, clearSurrogate, markSurrogate, revokeToken, surrogatePath, LoginIntent, LoginOutcome,
  LOGIN_LOGOUT_MESSAGE, LOGIN_SURROGATE_FEATURES, LOGIN_SURROGATE_NAME, LOGIN_TOKEN_MESSAGE,
} from '@owlmeans/client-auth/login'
import type { LoginContext, LoginEnv, LoginPlugin } from '@owlmeans/client-auth/login'
import { SURROGATE_LOGIN, SURROGATE_LOGIN_PRIORITY } from './consts.js'
import { awaitSurrogate } from './pump.js'

/**
 * Login for a document that cannot complete the flow where it is.
 *
 * An app embedded in a frame cannot redirect to an identity provider: the provider refuses to be
 * embedded (`frame-ancestors`), and its session cookies are third-party there. So the flow runs
 * one window up, in a surrogate window that is top-level and first-party on this application's own
 * origin — where the very same flow completes normally — and the token is passed back to the
 * document that asked for it.
 *
 * This plugin is deliberately not OIDC-specific. The mechanic is "run the login route one window
 * up and hand the token back", and the adoption is the plain auth service, so any relying party
 * that renders a login route gets it by registering nothing.
 *
 * `match` covers BOTH halves of the lifecycle — the framed opener and the surrogate itself, where
 * `embedded` is false. Inside the surrogate the redirect plugin must not win: that window IS
 * top-level, so it authorizes by an ordinary redirect and differs only in what it does with the
 * token at the end.
 */
export const makeSurrogateLoginPlugin = (): LoginPlugin => {
  /**
   * Give the token to whoever is entitled to it, and get out of the way.
   *
   * Shared by `complete` (a token was just issued here) and `resume` (one was already here),
   * because what happens to it is the same in both cases and only the question differs.
   */
  const handBack = async (token: string, env: LoginEnv): Promise<LoginOutcome> => {
    if (!env.surrogate) {
      // This document started the flow and finished it in place — it already has what it needs.
      return LoginOutcome.Passed
    }
    if (!env.hasOpener) {
      // Authenticated with nowhere to send it. `Cross-Origin-Opener-Policy: same-origin` from the
      // provider severs `window.opener` permanently, so this is not a timing problem to retry.
      return LoginOutcome.Orphaned
    }

    clearSurrogate()
    // Both windows are the same origin (the surrogate is this application's own login route), so
    // the origin is pinned rather than passed as `*` — the message carries a bearer token.
    window.opener.postMessage({ type: LOGIN_TOKEN_MESSAGE, token }, window.location.origin)
    window.close()

    return LoginOutcome.Handled
  }

  const plugin: LoginPlugin = {
    alias: SURROGATE_LOGIN,
    priority: SURROGATE_LOGIN_PRIORITY,
    mode: 'surrogate',
    match: env => env.hasWindow && (env.embedded || env.surrogate),

    enter: () => { markSurrogate() },

    begin: (ctx, request, env) => {
      // Already one window up — nothing to open, just run the flow.
      if (env.surrogate) {
        window.location.href = request.url

        return Promise.resolve(LoginOutcome.Redirected)
      }

      // Opened FIRST and synchronously: `window.open` escapes the popup blocker only while the
      // user gesture is still being handled, so nothing may be awaited before this line. That is
      // why this function is not `async`.
      //
      // The window opens on the surrogate route rather than on the dispatcher, so its very first
      // paint is a bare "signing you in" panel instead of the application with its navigation. The
      // dispatcher address travels as `next`, because the provider's callback still lands there and
      // whatever flow parameters the caller's URL carried must survive the hop.
      const path = surrogatePath(ctx as LoginContext, {
        intent: LoginIntent.Login, next: request.url,
      })
      const surrogate = window.open(
        path ?? request.url, LOGIN_SURROGATE_NAME, LOGIN_SURROGATE_FEATURES
      )
      if (surrogate == null) {
        return Promise.resolve(LoginOutcome.Failed)
      }

      return awaitSurrogate(surrogate, LOGIN_TOKEN_MESSAGE, async data => {
        if (data.token == null || data.token === '') {
          return LoginOutcome.Failed
        }
        await adoptToken(ctx as LoginContext, data.token)
        // Adopting the token is not the end of the flow — running the caller's continuation is,
        // exactly as the redirect plugin does before it reports `Handled`. Without it the token
        // lands in the auth service and nothing else happens: the framed app keeps rendering its
        // signed-out tree, and the user watches the login window close over a preview that never
        // changes. `Handled` promises the caller there is nothing left to do.
        await request.navigate?.()

        return LoginOutcome.Handled
      })
    },

    authorize: async (_ctx, url, env) => {
      // The surrogate is top-level, so it redirects like any ordinary tab.
      if (env.surrogate) {
        window.location.href = url

        return LoginOutcome.Redirected
      }

      // Framed, and not yet one window up. A redirect from here would land in the frame and be
      // refused, and the window that would fix it cannot be opened without a user gesture — so the
      // caller is told to render a control rather than to navigate.
      return LoginOutcome.Gesture
    },

    complete: async (_ctx, token, env) => await handBack(token, env),

    // A session that was already here is worth exactly as much as one just issued — to the window
    // that asked for it. Without this the surrogate would render the signed-in application to
    // itself and the framed app would stay signed out, which is the whole reported defect.
    resume: async (_ctx, token, env) => await handBack(token, env),

    logout: (ctx, request, env) => {
      // Already one window up — end the session here and tell the opener.
      if (env.surrogate) {
        return revokeToken(ctx as LoginContext)
          .then(async () => await plugin.logoutComplete!(ctx, env))
      }

      const path = surrogatePath(ctx as LoginContext, { intent: LoginIntent.Logout })
      // Opened first and synchronously, for the same reason `begin` does.
      const surrogate = path != null
        ? window.open(path, LOGIN_SURROGATE_NAME, LOGIN_SURROGATE_FEATURES)
        : null

      // The local session goes next, and UNCONDITIONALLY. A blocked window, a severed opener or a
      // user who closes the popup must never leave THIS document signed in: a logout that only
      // half happened is bad, and one that did not happen at all is worse.
      const local = revokeToken(ctx as LoginContext)
      if (surrogate == null) {
        return local.then(async () => {
          await request.navigate?.()

          return LoginOutcome.Failed
        })
      }

      return local.then(async () => await awaitSurrogate(
        surrogate, LOGIN_LOGOUT_MESSAGE, async () => {
          await request.navigate?.()

          return LoginOutcome.Handled
        }
      ))
    },

    logoutComplete: async (_ctx, env) => {
      if (!env.surrogate) {
        return LoginOutcome.Passed
      }
      if (!env.hasOpener) {
        return LoginOutcome.Orphaned
      }
      clearSurrogate()
      window.opener.postMessage({ type: LOGIN_LOGOUT_MESSAGE, ok: true }, window.location.origin)
      window.close()

      return LoginOutcome.Handled
    },
  }

  return plugin
}
