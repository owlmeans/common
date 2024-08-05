import { assertContext } from '@owlmeans/context'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/module'
import type { Context } from '@owlmeans/server-api'
import type { RefedModuleHandler } from '@owlmeans/server-module'
import type { Connection } from '@owlmeans/socket'
import type { WebSocket } from '@fastify/websocket'
import { makeConnection } from './utils/connection.js'

export const handleConnection: <T extends Connection = Connection>(
  handler: (conn: T, ctx: Context, req: AbstractRequest<WebSocket>, res: AbstractResponse<any>) => Promise<void>
) => RefedModuleHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  const ctx = assertContext(ref.ref?.ctx) as Context
  try {
    await handler(makeConnection(req, ctx) as any, ctx, req, res)
  } catch (e) {
    res.reject(e as Error)
  }

  // Actually it does nothing - just for compatibility here
  return res.value
}
