import { Layer } from './consts.js'
import type { Contextual, BasicContext, BasicConfig } from './types.js'

export const appendContextual = <T extends Contextual>(alias: string, contextual: Partial<T>): T => {
  contextual.alias = alias
  contextual.registerContext = <T, C extends BasicConfig>(context: BasicContext<C>) => {
    const _contextual = contextual.ctx == null
      ? contextual
      : contextual.reinitializeContext != null
        ? contextual.reinitializeContext(context) : contextual

    // We do NOT update context when it's the same contextual with already set context
    // Actuall we just do not need to switch context in many on the level of context consumer
    if (_contextual.ctx == null) {
      _contextual.ctx = context
    }

    return _contextual as T
  }

  contextual.assertCtx = (
    location => assertContext(contextual.ctx, location ?? contextual.alias)
  ) as typeof contextual.assertCtx

  return contextual as T
}

// export type UpdContextType<C extends Config, T extends Context<C>, ExtraType> = T & ExtraType

// export type UpdConfigType<T extends Config, ExtraType> = T & ExtraType

/**
 * @throws {SyntaxError}
 */
export const assertContext = <C extends BasicConfig, T extends BasicContext<C>>(ctx: T | BasicContext<BasicConfig> | undefined, location?: string): T => {
  if (ctx == null) {
    throw new SyntaxError(`Context not found in ${location}`)
  }
  return ctx as T
}

export const isContextWithoutIds = <C extends BasicConfig, T extends BasicContext<C>>(context: T): boolean =>
  [Layer.System, Layer.Global, Layer.Service].includes(context.cfg.layer)
