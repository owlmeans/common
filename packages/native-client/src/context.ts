
import { makeClientContext } from '@owlmeans/client'
import { AppConfig, AppContext } from './types.js'
import { appendAuthService, AUTH_RESOURCE } from '@owlmeans/client-auth'
import { appendClientResource } from '@owlmeans/client-resource'
import { appendNativeDbService } from '@owlmeans/native-db'
import { useContext as useCtx } from '@owlmeans/client'
import { apiConfigMiddleware } from '@owlmeans/api-config-client'
import { extractPrimaryHost } from './utils/env.js'
import { makePermissionService } from './permissions.js'
import { appendNativeRouter } from '@owlmeans/native-router'

export const makeContext = <C extends AppConfig = AppConfig, T extends AppContext<C> = AppContext<C>>(
  cfg: C
): T => {
  const context = makeClientContext(cfg) as T
  extractPrimaryHost<C, T>(context)
  context.registerMiddleware(apiConfigMiddleware)

  appendAuthService<C, T>(context)
  appendNativeDbService<C, T>(context)
  appendClientResource<C, T>(context, AUTH_RESOURCE)
  appendNativeRouter<C, T>(context)
  context.registerService(makePermissionService())

  context.makeContext = makeContext as typeof context.makeContext

  return context
}

export const useContext = <C extends AppConfig = AppConfig,T extends AppContext<C> = AppContext<C>>() =>
  useCtx<C,T>()
