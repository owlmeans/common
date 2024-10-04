import { DispatcherHOC } from '@owlmeans/client-auth'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useI18nLib } from '@owlmeans/client-i18n'
import { AUTH_QUERY } from '@owlmeans/auth'
import { useContext } from '../../context.js'

export const Dispatcher = DispatcherHOC(({ provideToken }) => {
  const [query] = useSearchParams()
  const context = useContext()

  const t = useI18nLib('auth', 'dispatcher')

  useEffect(() => {
    const token = query.get(AUTH_QUERY)
    if (token != null) {
      const params: Record<string, string> = {}
      query.forEach((value, key) => {
        if (key !== AUTH_QUERY) {
          params[key] = value
        }
      })

      provideToken({ token }, params)
    } else {
      context.auth().authenticated().then(
        authzToken => {
          if (authzToken == null) {
            provideToken({ token: '' }, undefined)
          }
        }
      )
    }
  }, [])

  return query.has(AUTH_QUERY) ? <div>{t('loading')}</div> : undefined
})
