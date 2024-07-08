import { useEffect, useState } from 'react'
import type { TDispatcherHOC } from './types.js'
import type { AuthToken } from '@owlmeans/auth'
import { useNavigate } from 'react-router'
import type { ClientModule } from '@owlmeans/client-module'
import { HOME } from '@owlmeans/context'
import { DEFAULT_ALIAS } from '../../consts.js'
import type { AuthService } from '../../types.js'

export const DispatcherHOC: TDispatcherHOC = Renderer => ({ context }) => {
  const [token, provideToken] = useState<AuthToken | undefined>()
  const navigate = useNavigate()
  useEffect(() => {
    if (token != null) {
      const auth = context.service<AuthService>(DEFAULT_ALIAS)
      auth.authenticate(token)
        .then(async () => {
          const [url] = await context.module<ClientModule<string>>(HOME).call()
          navigate(url)
        }).catch((e: Error) => {
          // @TODO Show error on the component
          console.error(e)
        })
    }
  }, [token])
  return <><Renderer provideToken={provideToken} /></>
}
