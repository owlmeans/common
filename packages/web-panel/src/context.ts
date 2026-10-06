import { appendFlowService } from '@owlmeans/web-flow'
import type { AppConfig , AppContext } from './types.js'
import { makeContext as makeClientContext, useContext as useCtx } from '@owlmeans/web-client'
import { apiConfigMiddleware } from '@owlmeans/api-config-client'
import { appendLoginScreen } from './components/login/append.js'
import { appendSocketStatus } from '@owlmeans/client-socket'

export const makeContext = <C extends AppConfig, T extends AppContext<C>>(cfg: C): T => {
  const context = makeClientContext(cfg) as T

  context.registerMiddleware(apiConfigMiddleware)

  appendFlowService<C, T>(context)
  context.flow = () => context.service('flow')

  // Registered unconditionally — cheap, and it is what lets `SocketReloadDialog` and
  // `useSocketStatus()` work at all. It stays inert for an app that never opts into
  // `cfg.socket.reloadDialog`: nothing renders, and every `ws()`/`useWs()` connection reporting
  // into it costs one map write per state change.
  appendSocketStatus<C, T>(context)

  // Every app on this package gets the shadcn sign-in screen with no wiring of its own; one that
  // wants its logo on it calls `appendLoginScreen` again, which is idempotent.
  appendLoginScreen<C, T>(context)

  return context
}

export const useContext = <C extends AppConfig = AppConfig,T extends AppContext<C> = AppContext<C>>() =>
  useCtx<C,T>()
