import { appendConfigResource, PLUGIN_RECORD } from '@owlmeans/config'
import { ServerConfig, ServerContext } from './types.js'
import { fileConfigReader } from './utils/context.js'
import { makeBasicContext } from '@owlmeans/context'
import { PLUGINS, TRUSTED } from '@owlmeans/config'
import { authMiddleware, makeBasicEd25519Guard } from '@owlmeans/auth-common'
import { appendLog } from '@owlmeans/log'

export const makeServerContext = <C extends ServerConfig, T extends ServerContext<C>>(cfg: C): T => {
  const context = makeBasicContext(cfg) as T

  context.registerMiddleware(fileConfigReader)
  // After the file reader, so a level given as `/etc/app-config/log-level` is applied resolved.
  appendLog(context)

  appendConfigResource<C, T>(context)
  appendConfigResource<C, T>(context, TRUSTED, TRUSTED)
  appendConfigResource<C, T>(context, PLUGINS, PLUGIN_RECORD)
  context.registerService(makeBasicEd25519Guard(TRUSTED))
  context.registerMiddleware(authMiddleware)

  return context
}
