import { makeBasicContext } from '@owlmeans/context'
import type { ClientConfig, ClientContext } from './types.js'
import { appendApiClient } from '@owlmeans/api'

export const makeClientContext = <C extends ClientConfig, T extends ClientContext<C>>(cfg: C): T => {
  const context = makeBasicContext(cfg) as T

  context.serviceRoute = (alias, makeDefault) => {
    const service = context.cfg.services[alias]
    if (service == null) {
      /**
       * The alternatives belong in the message, not in a debugger session.
       *
       * This throws at module scope, during import, so the app is blank and the stack points at
       * a framework file — there is nowhere for a reader to look up what WAS registered. And
       * the mistake it reports is almost always one specific confusion: a route alias passed
       * where a service alias belongs. Both are strings, so nothing before this point objects.
       *
       * `?? {}` because `services` is optional on the config — an error must never be replaced
       * by a worse one thrown while describing it.
       */
      const registered = Object.keys(context.cfg.services ?? {})

      throw new SyntaxError(
        `Service not found ${alias}. Registered services: `
        + (registered.length > 0 ? registered.join(', ') : '(none)')
      )
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
