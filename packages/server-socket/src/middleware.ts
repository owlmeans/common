
import type { Middleware } from '@owlmeans/context'
import { MiddlewareType, MiddlewareStage, assertContext } from '@owlmeans/context'
import type { SocketService } from './types.js'
import { DEFAULT_ALIAS as WEB_ALIAS } from '@owlmeans/server-api'
import type { ApiServer, Config, Context,  } from '@owlmeans/server-api'
import { DEFAULT_ALIAS } from './consts.js'


export const createSocketMiddleware = (web: string = WEB_ALIAS, socket = DEFAULT_ALIAS): Middleware => {
  const middleware: Middleware = {
    type: MiddlewareType.Context,
    stage: MiddlewareStage.Loading,
    apply: async ctx => {
      const context = assertContext<Config, Context>(ctx as unknown as Context, 'socket-middleware')
      const webService = context.service<ApiServer>(web)
      const socketService = context.service<SocketService>(socket)
      await socketService.update(webService)
    }
  }

  return middleware
}
