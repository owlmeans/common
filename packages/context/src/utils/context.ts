import type { MiddlewareStage, MiddlewareType } from '../consts.js'
import type { BasicConfig, BasicContext, Middleware } from '../types.js'

export const getMiddlerwareKey = (middleware: Middleware) => createMiddlewareKey(middleware.type, middleware.stage)

export const createMiddlewareKey = (type: MiddlewareType, stage: MiddlewareStage) => `${type}:${stage}`

export const applyMiddlewares = <C extends BasicConfig, T extends BasicContext<C>>(
  context: T,
  middlewares: Record<string, Middleware[]>,
  type: MiddlewareType,
  stage: MiddlewareStage,
  args?: Record<string, string | undefined>
) => Promise.all(
  middlewares[createMiddlewareKey(type, stage)]?.map(async middleware => middleware.apply<C, T>(context, args)) ?? []
)
