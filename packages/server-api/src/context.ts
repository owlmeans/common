import type { Config } from '@owlmeans/server-context'
import { makeBasicContext } from './utils/server.js'
import type { BasicServerContext } from './utils/types.js'
import { appendApiServer } from './server.js'

export const makeContext = <C extends Config>(cfg: C) => {
  const context: BasicServerContext = makeBasicContext(cfg)

  return appendApiServer(context)
}
