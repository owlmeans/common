import type { Auth } from '@owlmeans/auth'
import { EnvelopeKind, makeEnvelopeModel } from '@owlmeans/basic-envelope'
import { AUTH_RESOURCE, USER_ID } from '@owlmeans/client-auth'
import type { ClientAuthResource } from '@owlmeans/client-auth'
import type { AppConfig, AppContext } from '@owlmeans/web-client'
import {
  OIDC_POPUP_FEATURES, OIDC_POPUP_NAME, OIDC_POPUP_TOKEN, OIDC_POPUP_WATCH_INTERVAL
} from './consts.js'

/**
 * Whether this document is embedded in a frame.
 *
 * Reading `window.top` across origins throws, and that throw is itself the answer: a `top` that
 * differs and a `top` that cannot be reached both mean "framed".
 */
export const isFramed = (): boolean => {
  try {
    return window.self !== window.top
  } catch {
    return true
  }
}

/** Whether this document is the login popup opened by {@link loginViaPopup}. */
export const isOidcLoginPopup = (): boolean =>
  window.opener != null && window.name === OIDC_POPUP_NAME

/**
 * Adopt an issued bearer token as this context's authentication.
 *
 * Shared by the two ways a token arrives — the dispatcher's own code exchange and a popup handing
 * one back — so both leave the client in the same state.
 */
export const applyAuthToken = async <C extends AppConfig, T extends AppContext<C>>(
  context: T, token: string
): Promise<void> => {
  const authResource = context.resource<ClientAuthResource>(AUTH_RESOURCE)
  await authResource.save({ id: USER_ID, token })

  const [, authorization] = token.split(' ')
  context.auth().auth = makeEnvelopeModel<Auth>(authorization, EnvelopeKind.Token).message()
  context.auth().token = token
}

/**
 * Hand the issued token back to the window that opened this popup, then close.
 *
 * Returns `false` when this document is not a login popup, so the caller can carry on with the
 * ordinary in-page continuation instead.
 *
 * The popup owns a *first-party* storage partition while the opener — an embedded frame — owns a
 * separate, partitioned one, so the token this document just stored is invisible there. Passing
 * the value explicitly is what bridges the two.
 */
export const handBackOidcToken = (token: string | null | undefined): boolean => {
  if (!isOidcLoginPopup() || token == null || token === '') {
    return false
  }

  // Both windows are the same origin (the popup is this application's own dispatcher), so the
  // origin is pinned rather than passed as `*` — the message carries a bearer token.
  window.opener.postMessage({ type: OIDC_POPUP_TOKEN, token }, window.location.origin)
  window.close()

  return true
}

/**
 * Run OIDC login in a popup and adopt the token it hands back.
 *
 * **Call this synchronously from the user gesture that starts login.** `window.open` escapes the
 * popup blocker only while the gesture is still being handled, and any `await` before it ends
 * that window — which is why the popup is opened first and this is not an `async` function.
 *
 * The popup is a *top-level* context on the application's own origin, so the provider's
 * `frame-ancestors` / `X-Frame-Options` restrictions do not apply to it and its cookies are
 * first-party again. That is the whole point: the same flow that cannot complete inside a frame
 * completes normally one window up.
 *
 * Resolves `true` once the token has been adopted, `false` if the popup was blocked or the user
 * closed it first.
 */
export const loginViaPopup = <C extends AppConfig, T extends AppContext<C>>(
  context: T, dispatcherUrl: string
): Promise<boolean> => {
  const popup = window.open(dispatcherUrl, OIDC_POPUP_NAME, OIDC_POPUP_FEATURES)
  if (popup == null) {
    return Promise.resolve(false)
  }

  return new Promise<boolean>(resolve => {
    let settled = false
    let watch: ReturnType<typeof setInterval> | undefined

    const finish = (result: boolean): void => {
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
      if (data?.type !== OIDC_POPUP_TOKEN || data.token == null || data.token === '') {
        return
      }
      void applyAuthToken<C, T>(context, data.token)
        .then(() => finish(true))
        .catch(() => finish(false))
    }

    window.addEventListener('message', onMessage)
    // A popup the user simply closes announces nothing, so the only way to stop waiting on it is
    // to watch for it going away.
    watch = setInterval(() => {
      if (popup.closed) {
        finish(false)
      }
    }, OIDC_POPUP_WATCH_INTERVAL)
  })
}
