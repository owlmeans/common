import type { ClientEntrypoint } from '@owlmeans/client-entrypoint'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import { provideRequest } from '@owlmeans/client-entrypoint'
import { EntrypointOutcome } from '@owlmeans/entrypoint'
import type { Connection } from '@owlmeans/socket'
import { SocketInitializationError } from '@owlmeans/socket'
import { makeConnection } from './utils/connection.js'
import { assertContext } from '@owlmeans/context'
import type { Config, Context } from './types.js'
import { useContext, useValue } from '@owlmeans/client'
import { AUTH_QUERY } from '@owlmeans/auth'
import { urlCall } from '@owlmeans/client-entrypoint/utils'
import { useEffect, useMemo } from 'react'

export const ws = async (module: ClientEntrypoint<string>, request?: AbstractRequest<{ token?: string }>): Promise<Connection> => {
  const ctx = assertContext<Config, Context>(module.ctx as Context, 'client-ws')
  request = request ?? provideRequest(module.getAlias(), module.getPath())
  const [url, state] = await urlCall({ ref: module })(request)

  if (state !== EntrypointOutcome.Ok) {
    throw new SocketInitializationError
  }
  const socket = new WebSocket(url)

  return new Promise(resolve => {
    socket.onopen = () => {
      const heartbeat = setInterval(() => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: 'ping' }))
        }
      }, 30_000)

      socket.addEventListener('close', () => {
        console.info('WebSocket connection closed, clearing heartbeat interval.')
        clearInterval(heartbeat)
      })

      resolve(makeConnection(socket, ctx))
    }
  })
}

export const useWs = (module: string | ClientEntrypoint<any>, request?: Partial<AbstractRequest<any>>): Connection | null => {
  const ctx = useContext()
  const mod = useMemo(
    () => typeof module === 'string' ? ctx.entrypoint<ClientEntrypoint>(module) : module,
    [module]
  )
  const connection = useValue<Connection>(async () => {
    const _request = provideRequest(mod.getAlias(), mod.getPath())
    Object.assign(_request, request)
    return await ws(mod, _request)
  }, [
    mod.getAlias(),
    request?.query?.[AUTH_QUERY],
    request?.params ? JSON.stringify(request.params) : undefined
  ])

  useEffect(() => {
    if (connection != null) {
      return () => {
        void connection.close()
      }
    }
  }, [connection])

  return connection
}
