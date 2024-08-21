import { useEffect, useState } from 'react'
import type { TDispatcherHOC } from './types.js'
import type { AuthToken } from '@owlmeans/auth'
import { AUTH_QUERY, DISPATCHER } from '@owlmeans/auth'
import type { ClientModule } from '@owlmeans/client-module'
import { HOME } from '@owlmeans/context'
import { DEFAULT_ALIAS } from '../../consts.js'
import type { AuthService } from '@owlmeans/auth-common'
import { useNavigate } from '@owlmeans/client'

export const DispatcherHOC: TDispatcherHOC = Renderer => ({ context, params, alias, query }) => {
  const [token, provideToken] = useState<AuthToken | undefined>()
  const navigator = useNavigate()
  useEffect(() => {
    if (token != null) {
      const auth = context.service<AuthService>(DEFAULT_ALIAS)
      auth.authenticate(token)
        .then(async () => {
          alias = alias == null || alias === DISPATCHER ? HOME : alias
          const module = context.module<ClientModule<string>>(alias)
          if (alias === HOME) {
            params = {}
            query = {}
          } else {
            query = { ...query }
            if (query != null && AUTH_QUERY in query) {
              delete query[AUTH_QUERY]
            }
          }
          await navigator.navigate(module, { params, query })
        }).catch((e: Error) => {
          // @TODO Show error on the component
          console.error(e)
        })
    }
  }, [token])

  return <Renderer provideToken={provideToken} />
}
