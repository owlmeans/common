import { makeClientContext } from '@owlmeans/client'
import { appendWebDbService } from '@owlmeans/web-db'
import { apiConfigMiddleware } from '@owlmeans/api-config-client'
import { extractPrimaryHost, useContext as useCtx } from '@owlmeans/web-client'
import type { AppConfig as Config, AppContext as Context } from '@owlmeans/web-client'
import { AppConfig, AppContext } from './types.js'
import { appendFlowService } from '@owlmeans/web-flow'

export const makeContext = <C extends Config, T extends Context<C>>(cfg: C): T => {
  const context = makeClientContext(cfg) as T
  extractPrimaryHost<C, T>(context)

  appendWebDbService<C, T>(context)
  context.registerMiddleware(apiConfigMiddleware)
  
  appendFlowService<C, T>(context);
  (context as unknown as AppContext<AppConfig>).flow = () => context.service('flow')

  context.makeContext = makeContext as typeof context.makeContext

  return context
}

export const useContext = <C extends AppConfig = AppConfig,T extends AppContext<C> = AppContext<C>>(): T => 
  useCtx() as unknown as T
