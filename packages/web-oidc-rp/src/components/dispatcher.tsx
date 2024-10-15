
import { DispatcherHOC } from '@owlmeans/client-auth'
import { useSearchParams } from 'react-router-dom'
import { useEffect } from 'react'
import { useContext } from '@owlmeans/web-client'
import { useI18nLib } from '@owlmeans/client-i18n'
import { AUTH_QUERY } from '@owlmeans/auth'
import { useFlow } from '@owlmeans/web-flow'
import { OidcAuthService } from '../types.js'
import { DEFAULT_ALIAS } from '../consts.js'

export const Dispatcher = DispatcherHOC(({ provideToken, navigate }) => {
  const [query] = useSearchParams()
  const context = useContext()
  const client = useFlow()

  const t = useI18nLib('auth', 'dispatcher')

  useEffect(() => {
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
        if (redirect != null) {
          document.location.href = redirect
          return
        }
        const authzToken = await context.auth().authenticated()
        if (authzToken == null) {
          provideToken({ token: '' }, undefined)
        }
      })
    }
  }, [client])

  return query.has(AUTH_QUERY)
    ? <div>{t('loading')}</div>
    : undefined
})
