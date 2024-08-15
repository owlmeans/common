import { appendAuthService, AUTH_CACHE } from '@owlmeans/server-auth'
import { makeServerContext } from '@owlmeans/server-context'
import type { AppConfig, AppContext } from './types.js'
import { appendApiServer } from '@owlmeans/server-api'
import { appendApiClient } from '@owlmeans/api'
import { appendStaticResource } from '@owlmeans/static-resource'
import { appendSocketService, createSocketMiddleware } from '@owlmeans/server-socket'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C, customize: boolean = false) => {
  const context = makeServerContext(cfg) as T

  appendApiServer<C, T>(context)
  appendAuthService<C, T>(context)
  appendApiClient<C, T>(context)
  appendSocketService<C, T>(context)

  context.registerMiddleware(createSocketMiddleware())

  appendStaticResource<C, T>(context)
  if (!customize && !context.hasResource(AUTH_CACHE)) {
    appendStaticResource<C, T>(context, AUTH_CACHE)
  }

  context.makeContext = makeContext as any

  return context
}
