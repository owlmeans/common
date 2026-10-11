import { assertContext } from '@owlmeans/context'
import type {
  AbstractRequest, AbstractResponse, EntrypointProtocolDeclaration, HandlerRequest, RequestOf, ResponseOf,
} from '@owlmeans/entrypoint'
import type { Context } from '@owlmeans/server-api'
import type { BoundEntrypointHandler, RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import type { Connection } from '@owlmeans/socket'
import type { WebSocket } from '@fastify/websocket'
import { makeConnection } from './utils/connection.js'

/** Bind a socket protocol to its connection lifecycle without an alias lookup. */
export const connection = <
  Protocol extends EntrypointProtocolDeclaration,
  SocketContext extends Context = Context,
  SocketConnection extends Connection = Connection,
>(
  protocol: Protocol,
  handler: (
    connection: SocketConnection,
    context: SocketContext,
    request: HandlerRequest<RequestOf<Protocol>>,
    response: AbstractResponse<ResponseOf<Protocol>>,
  ) => Promise<void>,
): BoundEntrypointHandler<Protocol> => ({
  protocol,
  bind: ref => async (request, response) => {
    const context = assertContext(ref.ref?.ctx, protocol.alias) as SocketContext
    try {
      await handler(
        makeConnection(request as AbstractRequest<WebSocket>, context) as SocketConnection,
        context,
        request as unknown as HandlerRequest<RequestOf<Protocol>>,
        response as AbstractResponse<ResponseOf<Protocol>>,
      )
      response.resolve(undefined as ResponseOf<Protocol>)
    } catch (error) {
      response.reject(error as Error)
    }

    return response.value
  },
})

export const handleConnection: <T extends Connection = Connection>(
  handler: (conn: T, ctx: Context, req: AbstractRequest<WebSocket>, res: AbstractResponse<any>) => Promise<void>
) => RefedEntrypointHandler<AbstractResponse<any>> = handler => ref => async (req, res) => {
  const ctx = assertContext(ref.ref?.ctx) as Context
  try {
    await handler(makeConnection(req, ctx) as any, ctx, req, res)
  } catch (e) {
    res.reject(e as Error)
  }

  // Actually it does nothing - just for compatibility here
  return res.value
}
