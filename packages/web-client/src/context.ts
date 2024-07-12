
import { makeClientContext } from '@owlmeans/client-context'
import { AppConfig, AppContext } from './types.js'
import { appendAuthService, AUTH_RESOURCE } from '@owlmeans/client-auth'
import { appendWebDbService } from '@owlmeans/web-db'
import { appendClientResource } from '@owlmeans/client-resource'

export const makeContext = <C extends AppConfig = AppConfig, T extends AppContext<C> = AppContext<C>>(
  cfg: C
): T => {
  const context = makeClientContext(cfg) as T

  appendAuthService<C, T>(context)
  appendWebDbService<C, T>(context)
  appendClientResource<C, T>(context, AUTH_RESOURCE)

  context.makeContext = makeContext as typeof context.makeContext

  return context
}
