import { makeServerContext } from '@owlmeans/server-context'
import type { AppContext, AppConfig } from './types.js'
import { appendApiServer } from '@owlmeans/server-api'
import { appendApiClient } from '@owlmeans/api'
import { appendSocketService } from '@owlmeans/server-socket'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makeServerContext(cfg) as T

  appendApiServer<C, T>(context)
  appendApiClient<C, T>(context)
  appendSocketService<C, T>(context)

  context.makeContext = makeContext as typeof context.makeContext

  return context as T
}
