import { makeContext as makeBasicContext } from '@owlmeans/server-app'
import { appendStaticResource } from '@owlmeans/static-resource'
import { SESSION_ITEMS } from './consts.js'
import type { Config, Context } from './types.js'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeBasicContext<C, T>(cfg, true)

  // Register an in-memory resource for session items. No database required —
  // data lives in process memory and is cleared when the api restarts.
  appendStaticResource<C, T>(context, SESSION_ITEMS)

  // A child context has to inherit THIS factory, not the layer's — otherwise a derived context
  // is built without the resource registered above and every lookup on it throws.
  context.makeContext = makeContext as typeof context.makeContext

  return context
}
