import { Config, ClientContext } from './types.js'
import { makeBasicContext } from './utils/context.js'

export const makeContext = <C extends Config>(cfg: C): ClientContext<C> => {
  const context: ClientContext<C> = makeBasicContext(cfg)

  return context
}
