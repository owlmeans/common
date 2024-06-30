import { appendConfigResource } from '@owlmeans/config'
import { Config, ServerContext } from './types.js'
import { makeBasicContext } from './utils/context.js'

export const makeContext = <C extends Config>(cfg: C) => {
  const context: ServerContext<C> = makeBasicContext(cfg)
  return appendConfigResource(context)
}
