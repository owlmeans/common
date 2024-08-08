
import type { Middleware } from '@owlmeans/context'
import { MiddlewareType, MiddlewareStage, assertContext } from '@owlmeans/context'
import type { SocketService } from './types.js'
import { DEFAULT_ALIAS as WEB_ALIAS } from '@owlmeans/server-api'
import type { ApiServer, Config, Context, } from '@owlmeans/server-api'
import { DEFAULT_ALIAS } from './consts.js'


export const createSocketMiddleware = (web: string = WEB_ALIAS, socket = DEFAULT_ALIAS): Middleware => {
  const middleware: Middleware = {
    type: MiddlewareType.Context,
    stage: MiddlewareStage.Loading,
    apply: async ctx => {
      const context = assertContext<Config, Context>(ctx as unknown as Context, 'socket-middleware')
      const webService = context.service<ApiServer>(web)
      const socketService = context.service<SocketService>(socket)
      // @TODO There is some middlewares that are ok to work only once during context intialization
      
      if (!ctx.cfg.records?.find(record => record.id === '__socketServiceAdded')) {
        console.log('createSocketMiddleware: Middleware triggered for update...', ctx.cfg.records)
        await socketService.update(webService)
        if (ctx.cfg.records == null) {
          ctx.cfg.records = []
        }
        ctx.cfg.records.push({ id: '__socketServiceAdded' })
      }
    }
  }

  return middleware
}
