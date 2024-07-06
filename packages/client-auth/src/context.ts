import type { ContextType } from './types.js'
import type { Config } from '@owlmeans/client-context'
import { makeBasicContext } from './utils/context.js'
import { appendAuthService} from './service.js'

export const makeContext = <C extends Config>(cfg: C) => {
  const context = makeBasicContext(cfg) as ContextType<C>

  return appendAuthService(context)
}
