import { appendFlowService } from '@owlmeans/web-flow'
import type { AppConfig , AppContext } from './types.js'
import { makeContext as makeClientContext, useContext as useCtx } from '@owlmeans/web-client'
import { apiConfigMiddleware } from '@owlmeans/api-config-client'
import { appendLoginScreen } from './components/login/append.js'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makeClientContext(cfg) as T

  context.registerMiddleware(apiConfigMiddleware)

  appendFlowService<C, T>(context)
  context.flow = () => context.service('flow')

  // Every app on this package gets the shadcn sign-in screen with no wiring of its own; one that
  // wants its logo on it calls `appendLoginScreen` again, which is idempotent.
  appendLoginScreen<C, T>(context)

  return context
}

export const useContext = <C extends AppConfig = AppConfig,T extends AppContext<C> = AppContext<C>>() =>
  useCtx<C,T>()
