
import { DispatcherHOC } from '@owlmeans/client-auth'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useContext } from '@owlmeans/web-client'
import { useI18nLib } from '@owlmeans/client-i18n'
import { AUTH_QUERY } from '@owlmeans/auth'
import { OIDC_ERROR_DESCRIPTION_QUERY, OIDC_ERROR_QUERY } from '@owlmeans/oidc'
import { useFlow } from '@owlmeans/web-flow'
import { OidcAuthService } from '../types.js'
import { DEFAULT_ALIAS } from '../consts.js'
import {
  handBackOidcToken, isFramed, isOidcLoginPopup, loginViaPopup, markOidcLoginPopup
} from '../popup.js'

export const Dispatcher = DispatcherHOC(({ provideToken, navigate }) => {
  const context = useContext()
  const [query] = context.router().useSearchParams()
  const client = useFlow()

  const t = useI18nLib('auth', 'dispatcher')

  // The provider reports a failed authorization by redirecting BACK here with `error` set. Re-entering
  // the flow at that point sends the browser into the very authorization request that just failed —
  // an endless dispatcher <-> provider redirect loop that also hides the reason. Surface it, stop.
  const error = query.get(OIDC_ERROR_QUERY)
  const errorDescription = query.get(OIDC_ERROR_DESCRIPTION_QUERY)

  // `client` (from useFlow/useValue) is not guaranteed referentially stable across renders that
  // don't change its own deps, so this effect can re-run more than once for the same incoming
  // `code`. The exchange is not safe to repeat — the PKCE verifier is single-use (deleted on the
  // first successful read) and the authorization code itself is single-use at the provider — so a
  // second run always fails (`resource:unknown-record`) even though the first one succeeded. Guard
  // it explicitly rather than relying on the effect only firing once.
  const dispatchedRef = useRef(false)

  // Set when authorization can only continue in a popup: a framed document cannot be navigated to
  // the provider (it answers `frame-ancestors 'self'`), and opening the popup here would be a
  // blocked one — `window.open` needs the user's gesture, which an effect does not have.
  const [popupRequired, setPopupRequired] = useState(false)

  // Authenticated inside the popup, but with no way to tell the window that started the flow —
  // the opener was severed. Better to say so than to silently present a second, logged-in copy
  // of the application in a window the user never asked to browse in.
  const [popupOrphaned, setPopupOrphaned] = useState(false)

  const onPopupLogin = useCallback(() => {
    // Reloading this very URL inside the popup replays the flow one window up, where it is
    // top-level and first-party, and keeps whatever flow parameters the address already carries.
    void loginViaPopup(context, window.location.href).then(async authenticated => {
      if (authenticated) {
        await navigate()
      }
    })
  }, [context, navigate])

  useEffect(() => {
    // First statement in the effect on purpose: everything below can navigate this window to the
    // provider, and after that the evidence that this is the popup is gone.
    markOidcLoginPopup()

    if (client == null) {
      return
    }
    if (error != null) {
      console.error(`[oidc] authorization failed: ${error}${errorDescription != null ? ` — ${errorDescription}` : ''}`)
      return
    }
    if (dispatchedRef.current) {
      return
    }
    dispatchedRef.current = true

    const token = query.get(AUTH_QUERY)
    const params: Record<string, string> = {}
    query.forEach((value, key) => {
      if (key !== AUTH_QUERY) {
        params[key] = value
      }
    })

    if (token != null) {
      // This is required for compatibility with a standard OwlMeans Auth flow.
      provideToken({ token }, params)
    } else {
      const oidc = context.service<OidcAuthService>(DEFAULT_ALIAS)
      oidc.dispatch(params).then(async dispatched => {
        if (dispatched) {
          // Running as the login popup: the opener is an embedded frame with its own storage
          // partition, so it cannot see the token just stored here — pass it over and close.
          if (handBackOidcToken(context.auth().token)) {
            return
          }
          if (isOidcLoginPopup()) {
            setPopupOrphaned(true)
            return
          }
          return await navigate()
        }
        if (client == null) {
          return
        }
        const redirect = await oidc.authenticate(client.flow(), params)
        if (redirect != null && redirect !== '') {
          if (isFramed() && !isOidcLoginPopup()) {
            setPopupRequired(true)
            return
          }
          document.location.href = redirect
          return
        }
        const authzToken = await context.auth().authenticated()
        if (authzToken == null) {
          provideToken({ token: '' }, undefined)
        } else {
          await navigate()
        }
      })
    }
  }, [client, error])

  if (error != null) {
    return <div>{t('error', { error: errorDescription ?? error })}</div>
  }

  if (popupOrphaned) {
    return <div>{t('popup-orphaned', {
      defaultValue: 'Signed in. You can close this window and continue in the application.'
    })}</div>
  }

  if (popupRequired) {
    return <button type="button" onClick={onPopupLogin}>
      {t('popup-login', { defaultValue: 'Sign in' })}
    </button>
  }

  return query.has(AUTH_QUERY)
    ? <div>{t('loading')}</div>
    : undefined
})
