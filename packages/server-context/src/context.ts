import { appendConfigResource } from '@owlmeans/config'
import { ServerConfig, ServerContext } from './types.js'
import { fileConfigReader } from './utils/context.js'
import { makeBasicContext } from '@owlmeans/context'
import { TRUSTED } from './consts.js'

export const makeServerContext = <C extends ServerConfig, T extends ServerContext<C>>(cfg: C): T => {
  const context = makeBasicContext(cfg) as T

  context.registerMiddleware(fileConfigReader)

  context.makeContext = makeServerContext as typeof context.makeContext

  appendConfigResource<C, T>(context)
  appendConfigResource<C, T>(context, TRUSTED, TRUSTED)

  return context
}
