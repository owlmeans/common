import type { MiddlewareStage, MiddlewareType } from '../consts.js'
import type { BasicConfig, BasicContext, Middleware } from '../types.js'
import type { MiddlewareUtils } from './middleware/types.js'

export const createMiddlewareUtils = (): MiddlewareUtils => {
  const createMiddlewareKey = (type: MiddlewareType, stage: MiddlewareStage): string => `${type}:${stage}`

  const getMiddlerwareKey = (middleware: Middleware): string => createMiddlewareKey(middleware.type, middleware.stage)

  const applyMiddlewares = <C extends BasicConfig, T extends BasicContext<C>>(
    context: T,
    middlewares: Record<string, Middleware[]>,
    type: MiddlewareType,
    stage: MiddlewareStage,
    args?: Record<string, string | undefined>
  ): Promise<void[]> => Promise.all(
    middlewares[createMiddlewareKey(type, stage)]?.map(async middleware => middleware.apply<C, T>(context, args)) ?? []
  )

  return { getMiddlerwareKey, createMiddlewareKey, applyMiddlewares }
}

export const middlewareUtils = createMiddlewareUtils()
