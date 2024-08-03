import type { ClientModule } from '@owlmeans/client-module'
import type { AbstractRequest } from '@owlmeans/module'
import { provideRequest } from '@owlmeans/client-module'
import { ModuleOutcome } from '@owlmeans/module'
import type { Connection } from '@owlmeans/socket'
import { SocketInitializationError } from '@owlmeans/socket'
import { makeConnection } from './utils/connection.js'
import { assertContext } from '@owlmeans/context'
import type { Config, Context } from './types.js'
import { useContext, useValue } from '@owlmeans/client'
import { AUTH_QUERY } from '@owlmeans/auth'
import { useEffect } from 'react'

export const ws = async (module: ClientModule<string>, request?: AbstractRequest<{ token?: string }>): Promise<Connection> => {
  const ctx = assertContext<Config, Context>(module.ctx as Context, 'client-ws')
  request = request ?? provideRequest(module.getAlias(), module.getPath())
  const auth = ctx.auth().token
  if (request.query[AUTH_QUERY] == null && auth != null) {
    request.query[AUTH_QUERY] = auth
  }
  const [url, state] = await module.call(request)
  if (state !== ModuleOutcome.Ok) {
    throw new SocketInitializationError
  }
  const socket = new WebSocket(url)

  return makeConnection(socket, ctx)
}

export const useWs = (module: string | ClientModule<any>, reuqest?: AbstractRequest<any>): Connection | null => {
  const ctx = useContext()
  const mod = typeof module === 'string' ? ctx.module<ClientModule>(module) : module
  const connection = useValue<Connection>(async () => {
    return await ws(mod, reuqest)
  }, [mod.getAlias(), reuqest?.query[AUTH_QUERY]])

  useEffect(() => {
    if (connection != null) {
      return () => {
        console.log('Close ws connection cause we are levaing the rendering scope')
        void connection.close()
      }
    }
  }, [connection])

  return connection
}
