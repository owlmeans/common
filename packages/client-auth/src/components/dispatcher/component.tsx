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
import type { FlowService } from '@owlmeans/client-flow'
import { DEFAULT_ALIAS as FLOW_SERVICE } from '@owlmeans/client-flow'
import { STD_OIDC_FLOW } from '@owlmeans/flow'
import { SERVICE_PARAM } from '@owlmeans/web-flow'

export const DispatcherHOC: TDispatcherHOC = Renderer => ({ context, params, alias, query }) => {
  const [forwarding, setForwarding] = useState<StateToken | undefined>()

  const navigator = useNavigate()
  const navigate = useCallback(async () => {
    alias = alias == null || alias === DISPATCHER ? HOME : alias
    const module = context.module<ClientModule<string>>(alias)
    if (alias === HOME) {
      params = {}
      query = {}
    } else {
      query = { ...forwarding?.query, ...query }
      if (query != null && AUTH_QUERY in query) {
        delete query[AUTH_QUERY]
      }
    }
    await navigator.navigate(module, { params, query })
  }, [forwarding])

  useEffect(() => {
    if (forwarding?.token != null) {
      if (forwarding.token.token === '') {
        const flow = context.service<FlowService>(FLOW_SERVICE)
        // @TODO: Make sure that the provided flow is compatible with OIDC flow or provide custom from step
        flow.ready().then(async () => {
          // We do nothing if we are in the middle of a flow
          console.log('~^ Try to resolve flow')
          if (await flow.supplied) {
            const state = await flow.state()
            console.log('Flow we are trying to avoid', state?.state())
            // If the flow we are in already has a targe, it means this is some flow 
            // that is really happening and we do not need to override it with our own.
            // It's MAY BE required on the auth manager service side, cause this 
            // component is actually reused by both service and identity providers of OwlMeans.
            if (state?.state().service !== '') {
              return
            }
          }
          console.log('~^ Proceed with redirect')
          const cfg = context.cfg.security?.auth
          const model = await flow.begin(cfg?.flow ?? STD_OIDC_FLOW, cfg?.enter)
          const target = (
            SERVICE_PARAM in params ? params[SERVICE_PARAM] : context.cfg.shortAlias
          ) as string | undefined
          if (target != null) {
            model.target(target)
          }
          await flow.proceed()
        })
      } else {
        const auth = context.service<AuthService>(DEFAULT_ALIAS)
        auth.authenticate(forwarding.token).then(async () => {
          return await navigate()
        }).catch((e: Error) => {
          // @TODO Show error on the component
          console.error(e)
        })
      }
    }
  }, [forwarding?.token])

  const provideToken = useCallback<DispatcherRendererProps["provideToken"]>((token, query) => {
    setForwarding({ token, query })
  }, [])

  return <Renderer provideToken={provideToken} navigate={navigate} />
}

interface StateToken {
  token: AuthToken
  query?: AbstractRequest['params']
}
