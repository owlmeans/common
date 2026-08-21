import {
  adoptToken, clearSurrogate, markSurrogate, LoginOutcome,
  LOGIN_SURROGATE_FEATURES, LOGIN_SURROGATE_NAME, LOGIN_TOKEN_MESSAGE, LOGIN_WATCH_INTERVAL,
} from '@owlmeans/client-auth/login'
import type { LoginContext, LoginPlugin } from '@owlmeans/client-auth/login'
import { SURROGATE_LOGIN, SURROGATE_LOGIN_PRIORITY } from './consts.js'

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
export const makeSurrogateLoginPlugin = (): LoginPlugin => ({
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

    // Opened FIRST and synchronously: `window.open` escapes the popup blocker only while the user
    // gesture is still being handled, so nothing may be awaited before this line. That is why this
    // function is not `async`.
    const surrogate = window.open(request.url, LOGIN_SURROGATE_NAME, LOGIN_SURROGATE_FEATURES)
    if (surrogate == null) {
      return Promise.resolve(LoginOutcome.Failed)
    }

    return new Promise<LoginOutcome>(resolve => {
      let settled = false
      let watch: ReturnType<typeof setInterval> | undefined

      const finish = (result: LoginOutcome): void => {
        if (settled) {
          return
        }
        settled = true
        window.removeEventListener('message', onMessage)
        if (watch != null) {
          clearInterval(watch)
        }
        resolve(result)
      }

      function onMessage(event: MessageEvent): void {
        if (event.origin !== window.location.origin) {
          return
        }
        const data = event.data as { type?: string, token?: string } | null
        if (data?.type !== LOGIN_TOKEN_MESSAGE || data.token == null || data.token === '') {
          return
        }
        void adoptToken(ctx as LoginContext, data.token)
          .then(() => finish(LoginOutcome.Handled))
          .catch(() => finish(LoginOutcome.Failed))
      }

      window.addEventListener('message', onMessage)
      // A window the user simply closes announces nothing, so the only way to stop waiting on it
      // is to watch for it going away.
      watch = setInterval(() => {
        if (surrogate.closed) {
          finish(LoginOutcome.Failed)
        }
      }, LOGIN_WATCH_INTERVAL)
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

  complete: async (_ctx, token, env) => {
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
  },
})
