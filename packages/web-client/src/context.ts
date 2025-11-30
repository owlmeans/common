
import { makeClientContext } from '@owlmeans/client'
import { AppConfig, AppContext } from './types.js'
import { AUTH_RESOURCE } from '@owlmeans/client-auth'
import { appendWebDbService } from '@owlmeans/web-db'
import { appendClientResource } from '@owlmeans/client-resource'
import { useContext as useCtx } from '@owlmeans/client'
import { extractPrimaryHost } from './helper.js'
import { appendWebAuthService } from './service.js'
import { appendWebRouter } from '@owlmeans/web-router'

export const makeContext = <C extends AppConfig = AppConfig, T extends AppContext<C> = AppContext<C>>(
  cfg: C
): T => {
  const context = makeClientContext(cfg) as T
  extractPrimaryHost<C, T>(context)

  appendWebAuthService<C, T>(context)
  appendWebDbService<C, T>(context)
  appendClientResource<C, T>(context, AUTH_RESOURCE)
  appendWebRouter<C, T>(context)

  context.makeContext = makeContext as typeof context.makeContext

  return context
}

export const useContext = <C extends AppConfig = AppConfig,T extends AppContext<C> = AppContext<C>>() =>
  useCtx<C,T>()
