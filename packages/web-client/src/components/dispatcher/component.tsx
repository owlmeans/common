import { DispatcherHOC } from '@owlmeans/client-auth'
import { useEffect } from 'react'
import { useSearchParams } from 'react-router'
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
      context.auth().authenticated().then(authzToken => {
        if (authzToken == null) {
          provideToken({ token: '' }, undefined)
        }
      })
    }
  }, [])

  return query.has(AUTH_QUERY) ? <div style={{
    width: '100%', // Makes the div occupy the full width
    display: 'flex', // Enables flexbox layout
    justifyContent: 'center', // Centers content horizontally
    alignItems: 'center', // Centers content vertically (if needed)
    textAlign: 'center', // Centers text within the div
    paddingTop: '1rem', // Adds some vertical padding
    paddingBottom: '1rem', // Adds some vertical padding
  }}>{t('loading')}</div> : undefined
})
