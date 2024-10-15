import { appendConfigResource, PLUGIN_RECORD } from '@owlmeans/config'
import { ServerConfig, ServerContext } from './types.js'
import { fileConfigReader } from './utils/context.js'
import { makeBasicContext } from '@owlmeans/context'
import { PLUGINS, TRUSTED } from '@owlmeans/config'
import { authMiddleware, makeBasicEd25519Guard } from '@owlmeans/auth-common'

export const makeServerContext = <C extends ServerConfig, T extends ServerContext<C>>(cfg: C): T => {
  const context = makeBasicContext(cfg) as T

  context.registerMiddleware(fileConfigReader)

  context.makeContext = makeServerContext as typeof context.makeContext

  appendConfigResource<C, T>(context)
  appendConfigResource<C, T>(context, TRUSTED, TRUSTED)
  appendConfigResource<C, T>(context, PLUGINS, PLUGIN_RECORD)
  context.registerService(makeBasicEd25519Guard(TRUSTED))
  context.registerMiddleware(authMiddleware)

  return context
}
