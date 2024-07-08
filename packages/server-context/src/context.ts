import { appendConfigResource } from '@owlmeans/config'
import { ServerConfig, ServerContext } from './types.js'
import { fileConfigReader } from './utils/context.js'
import { makeBasicContext } from '@owlmeans/context'

export const makeServerContext = <C extends ServerConfig, T extends ServerContext<C>>(cfg: C): T => {
  const context = makeBasicContext(cfg) as T

  context.registerMiddleware(fileConfigReader)

  context.makeContext = makeServerContext as typeof context.makeContext

  return appendConfigResource<C, T>(context)
}
