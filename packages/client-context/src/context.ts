import { Config, ClientContext } from './types.js'
import { makeBasicContext } from './utils/context.js'

export const makeContext = <C extends Config>(cfg: C): ClientContext<C> => {
  const context: ClientContext<C> = makeBasicContext(cfg)

  context.serviceRoute = (alias, makeDefault) => {
    const service = context.cfg.services[alias]
    if (service == null) {
      throw new SyntaxError(`Service not found ${alias}`)
    }

    if (typeof makeDefault === 'boolean') {
      service.default = makeDefault
    }

    return service
  }

  return context
}
