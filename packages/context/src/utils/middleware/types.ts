import type { MiddlewareStage, MiddlewareType } from '../../consts.js'
import type { BasicConfig, BasicContext, Middleware } from '../../types.js'

/** The middleware registry keys and the staged application of the middlewares a context holds. */
export interface MiddlewareUtils {
  /** The registry key a middleware is filed under: its type and stage. */
  getMiddlerwareKey: (middleware: Middleware) => string
  /** The registry key of one middleware type at one stage. */
  createMiddlewareKey: (type: MiddlewareType, stage: MiddlewareStage) => string
  /** Applies, in parallel, every middleware registered for the type at the stage. */
  applyMiddlewares: <C extends BasicConfig, T extends BasicContext<C>>(
    context: T,
    middlewares: Record<string, Middleware[]>,
    type: MiddlewareType,
    stage: MiddlewareStage,
    args?: Record<string, string | undefined>
  ) => Promise<void[]>
}
