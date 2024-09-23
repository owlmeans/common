import { useCallback, useEffect, useState } from 'react'
import type { DispatcherRendererProps, TDispatcherHOC } from './types.js'
import type { AuthToken } from '@owlmeans/auth'
import { AUTH_QUERY, DISPATCHER } from '@owlmeans/auth'
import type { ClientModule } from '@owlmeans/client-module'
import { HOME } from '@owlmeans/context'
import { DEFAULT_ALIAS } from '../../consts.js'
import type { AuthService } from '@owlmeans/auth-common'
import { useNavigate } from '@owlmeans/client'
import type { AbstractRequest } from '@owlmeans/module'

export const DispatcherHOC: TDispatcherHOC = Renderer => ({ context, params, alias, query }) => {
  const [forwarding, setForwarding] = useState<StateToken | undefined>()
  const navigator = useNavigate()
  useEffect(() => {
    if (forwarding?.token != null) {
      const auth = context.service<AuthService>(DEFAULT_ALIAS)
      auth.authenticate(forwarding.token)
        .then(async () => {
          alias = alias == null || alias === DISPATCHER ? HOME : alias
          const module = context.module<ClientModule<string>>(alias)
          if (alias === HOME) {
            params = {}
            query = {}
          } else {
            query = { ...forwarding.query, ...query }
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
  }, [forwarding?.token])

  const provideToken = useCallback<DispatcherRendererProps["provideToken"]>((token, query) => {
    setForwarding({ token, query })
  }, [])

  return <Renderer provideToken={provideToken} />
}

interface StateToken {
  token: AuthToken
  query?: AbstractRequest['params']
}
