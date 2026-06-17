import { appendFlowService } from '@owlmeans/web-flow'
import type { AppConfig , AppContext } from './types.js'
import { makeContext as makeClientContext, useContext as useCtx } from '@owlmeans/web-client'
import { apiConfigMiddleware } from '@owlmeans/api-config-client'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makeClientContext(cfg) as T

  context.registerMiddleware(apiConfigMiddleware)

  appendFlowService<C, T>(context)
  context.flow = () => context.service('flow')

  return context
}

export const useContext = <C extends AppConfig = AppConfig,T extends AppContext<C> = AppContext<C>>() =>
  useCtx<C,T>()
