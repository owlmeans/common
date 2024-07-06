import type { Config } from '@owlmeans/server-context'
import { makeBasicContext } from './utils/context.js'
import type { BasicContext } from './utils/types.js'
import { appendAuthService } from '@owlmeans/server-auth'

export const makeContext = <C extends Config>(cfg: C) => {
  const context: BasicContext = makeBasicContext(cfg)

  return appendAuthService(context)
}
