import { Contextual, Context } from './types.js'

export const appendContextual = <T extends Contextual>(alias: string, contextual: Partial<T>): T => {
  contextual.alias = alias
  contextual.registerContext = <T>(context: Context): T => {
    const _contextual = contextual.ctx == null
      ? contextual
      : contextual.reinitializeContext != null
        ? contextual.reinitializeContext() : contextual

    // We do NOT update context when it's the same contextual with already set context
    // Actuall we just do not need to switch context in many on the level of context consumer
    if (_contextual.ctx == null) {
      _contextual.ctx = context
    }

    return _contextual as T
  }

  return contextual as T
}

export type UpdContextType<T extends Context, ExtraType> = T & ExtraType



  /**
   * @throws {SyntaxError}
   */
  export const assertContext = <T extends Context>(ctx: T | undefined, location: string): T => {
    if (ctx == null) {
      throw new SyntaxError(`Context not found in ${location}`)
    }
    return ctx
  }