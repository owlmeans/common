import { useEffect, useState } from 'react'
import type { TDispatcherHOC } from './types.js'
import type { AuthToken } from '@owlmeans/auth'
import { useNavigate } from 'react-router'
import type { Module } from '@owlmeans/client-module'
import { HOME } from '@owlmeans/context'

export const DispatcherHOC: TDispatcherHOC = Renderer => ({ context }) => {
  const [token, provideToken] = useState<AuthToken | undefined>()
  const navigate = useNavigate()
  useEffect(() => {
    if (token != null) {
      context.auth().authenticate(token)
        .then(async () => {
          const [url] = await context.module<Module<string>>(HOME).call()
          navigate(url)
        }).catch(e => {
          // @TODO Show error on the component
          console.error(e)
        })
    }
  }, [token])
  return <><Renderer provideToken={provideToken} /></>
}
