import { useContext } from '@owlmeans/client'
import type { ClientModule } from '@owlmeans/client-module'
import { provideRequest } from '@owlmeans/client-module'
import { useWs as useWebSocket } from '@owlmeans/client-socket'
import type { AbstractRequest } from '@owlmeans/module'
import type { AuthServiceAppend } from './types.js'
import { useMemo } from 'react'
import type { ClientContext } from '@owlmeans/client-context'
import { AUTH_QUERY } from '@owlmeans/auth'

export const useWs = (
  module: string | ClientModule<any>, _request?: Partial<AbstractRequest<any>>
) => {
  const ctx = useContext() as unknown as AuthServiceAppend & ClientContext

  const mod = useMemo(
    () => typeof module === 'string' ? ctx.module<ClientModule>(module) : module, [module]
  )

  const request = useMemo(() => {
    if (_request == null) {
      _request = provideRequest(mod.getAlias(), mod.getPath())
    }
    try {
      if (_request?.query?.[AUTH_QUERY] == null) {
        if (_request.query == null) {
          _request.query = {}
        }
        _request.query[AUTH_QUERY] = ctx.auth().token
      }
    } catch (e) {
      console.error(e)
    }

    return _request
  }, [_request])

  return useWebSocket(module, request)
}
