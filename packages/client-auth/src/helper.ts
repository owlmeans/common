import { useContext, useNavigate } from '@owlmeans/client'
import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import { provideRequest } from '@owlmeans/client-entrypoint'
import { useWs as useWebSocket } from '@owlmeans/client-socket'
import type { WsOptions } from '@owlmeans/client-socket'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { AuthServiceAppend } from './types.js'
import { useEffect, useMemo, useState } from 'react'
import type { ClientContext } from '@owlmeans/client-context'
import { AUTH_QUERY, DISPATCHER } from '@owlmeans/auth'
// import { useFlow } from '@owlmeans/web-flow'
// import { DEFAULT_ENTITY } from './consts.js'
// import { OidcAuthStep } from '@owlmeans/flow'

export const useWs = (
  module: string | ClientEntrypoint<any>, _request?: Partial<AbstractRequest<any>>, options?: WsOptions
) => {
  const ctx = useContext() as unknown as AuthServiceAppend & ClientContext

  const mod = useMemo(
    () => typeof module === 'string' ? ctx.entrypoint<ClientEntrypoint>(module) : module, [module]
  )

  // Captured before the token is filled in below, so a caller who supplied their own token
  // keeps full control of it across a reconnect too — `beforeConnect` only refreshes ours.
  const callerSuppliedToken = _request?.query?.[AUTH_QUERY] != null

  const request = useMemo(() => {
    if (_request == null) {
      _request = provideRequest(mod.alias, mod.path())
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

  const wsOptions = useMemo<WsOptions>(() => ({
    ...options,
    beforeConnect: async req => {
      // A reconnect can land minutes after the socket first opened — refresh the bearer token
      // on every attempt rather than trust the one `request` was built with, or a token rotated
      // in between reopens the socket with a stale one the guard then rejects.
      if (!callerSuppliedToken) {
        try {
          req.query ??= {}
          req.query[AUTH_QUERY] = ctx.auth().token
        } catch (e) {
          console.error(e)
        }
      }
      await options?.beforeConnect?.(req)
    }
  }), [options, callerSuppliedToken])

  return useWebSocket(module, request, wsOptions)
}

export const useSelfAuth = (force: boolean = true/*, entity: string = DEFAULT_ENTITY*/) => {
  const context = useContext() as unknown as AuthServiceAppend & ClientContext
  // const flow = useFlow(context.cfg.shortAlias ?? context.cfg.service)
  const [authenticated, setAuthenticated] = useState(false)
  const nav = useNavigate()

  useEffect(() => {
    // if (flow == null) return
    context.auth().authenticated().then(async auth => {
      if (force && !auth) {
        nav.go(DISPATCHER)
        // flow.flow().entity(entity)
        // await flow.proceed(flow.flow().transition(OidcAuthStep.Ephemeral))
      }

      setAuthenticated(!!auth)
    })
  }, [])

  return authenticated
}
