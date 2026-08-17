
import { DispatcherHOC } from '@owlmeans/client-auth'
import { useEffect, useRef } from 'react'
import { useContext } from '@owlmeans/web-client'
import { useI18nLib } from '@owlmeans/client-i18n'
import { AUTH_QUERY } from '@owlmeans/auth'
import { OIDC_ERROR_DESCRIPTION_QUERY, OIDC_ERROR_QUERY } from '@owlmeans/oidc'
import { useFlow } from '@owlmeans/web-flow'
import { OidcAuthService } from '../types.js'
import { DEFAULT_ALIAS } from '../consts.js'

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

  useEffect(() => {
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
          return await navigate()
        }
        if (client == null) {
          return
        }
        const redirect = await oidc.authenticate(client.flow(), params)
        if (redirect != null && redirect !== '') {
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

  return query.has(AUTH_QUERY)
    ? <div>{t('loading')}</div>
    : undefined
})
