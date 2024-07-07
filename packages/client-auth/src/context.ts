import type { ContextType } from './types.js'
import type { Config } from '@owlmeans/client-context'
import { makeBasicContext } from './utils/context.js'
import { appendAuthService} from './service.js'
import { authMiddleware } from './middleware.js'

export const makeContext = <C extends Config>(cfg: C) => {
  const context = makeBasicContext(cfg) as ContextType<C>
  context.registerMiddleware(authMiddleware)
  return appendAuthService(context)
}
