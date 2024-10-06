import { makeServerContext } from '@owlmeans/server-context'
import type { AppContext, AppConfig } from './types.js'
import { appendApiServer } from '@owlmeans/server-api'
import { appendApiClient } from '@owlmeans/api'
import { appendSocketService, createSocketMiddleware } from '@owlmeans/server-socket'
import { DEFAULT_RELY } from './consts.js'
import { createRelyService } from './rely.js'
import { AUTH_CACHE } from '../consts.js'
import { appendStaticResource } from '@owlmeans/static-resource'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C, customize: boolean = false): T => {
  const context = makeServerContext(cfg) as T

  appendApiServer<C, T>(context)
  appendApiClient<C, T>(context)
  appendSocketService<C, T>(context)

  context.registerMiddleware(createSocketMiddleware())

  // @TODO figure out rely service via config?
  if (!customize && !context.hasService(DEFAULT_RELY)) {
    context.registerService(createRelyService(DEFAULT_RELY))
  }

  appendStaticResource<C, T>(context)
  if (!customize && !context.hasResource(AUTH_CACHE)) {
    appendStaticResource<C, T>(context, AUTH_CACHE)
  }

  context.makeContext = makeContext as typeof context.makeContext

  return context as T
}
