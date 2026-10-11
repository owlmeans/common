import type { Contextual, BasicContext, BasicConfig } from './types.js'

export const appendContextual = <T extends Contextual>(alias: string, contextual: Partial<T>): T => {
  contextual.alias = alias
  contextual.registerContext = <T, C extends BasicConfig>(context: BasicContext<C>) => {
    // A contextual binds to exactly one context — the first one that registers it.
    if (contextual.ctx == null) {
      contextual.ctx = context
    }

    return contextual as T
  }

  contextual.assertCtx = (
    location => assertContext(contextual.ctx, location ?? contextual.alias)
  ) as typeof contextual.assertCtx

  return contextual as T
}

/**
 * @throws {SyntaxError}
 */
export const assertContext = <C extends BasicConfig, T extends BasicContext<C>>(ctx: T | BasicContext<BasicConfig> | undefined, location?: string): T => {
  if (ctx == null) {
    throw new SyntaxError(`Context not found in ${location}`)
  }
  return ctx as T
}
