import { appendAuthService } from '@owlmeans/server-auth'
import { makeServerContext } from '@owlmeans/server-context'
import type { AppConfig, AppContext } from './types.js'
import { appendApiServer } from '@owlmeans/server-api'
import { appendApiClient } from '../../api/build/service.js'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C) => {
  const context = makeServerContext(cfg) as T

  appendApiServer<C, T>(context)
  appendAuthService<C, T>(context)
  appendApiClient<C, T>(context)

  context.makeContext = makeContext as any

  return context
}
