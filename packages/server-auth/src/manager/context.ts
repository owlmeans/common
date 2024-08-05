import { makeServerContext } from '@owlmeans/server-context'
import type { AppContext, AppConfig } from './types.js'
import { appendApiServer } from '@owlmeans/server-api'
import { appendApiClient } from '@owlmeans/api'
import { appendSocketService } from '@owlmeans/server-socket'
import { DEFAULT_RELY } from './consts.js'
import { createRelyService } from './rely.js'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makeServerContext(cfg) as T

  appendApiServer<C, T>(context)
  appendApiClient<C, T>(context)
  appendSocketService<C, T>(context)

  // @TODO figure out rely service via config?
  if (!context.hasService(DEFAULT_RELY)) {
    context.registerService(createRelyService(DEFAULT_RELY))
  }

  context.makeContext = makeContext as typeof context.makeContext

  return context as T
}
