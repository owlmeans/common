import { makeBasicContext } from '@owlmeans/context'
import type { ClientConfig, ClientContext } from './types.js'
import { appendApiClient } from '@owlmeans/api'

export const makeClientContext = <C extends ClientConfig, T extends ClientContext<C>>(cfg: C): T => {
  const context = makeBasicContext(cfg) as T

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

  appendApiClient<C, T>(context)

  context.makeContext = makeClientContext as typeof context.makeContext

  return context
}
