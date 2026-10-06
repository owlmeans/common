import { MiddlewareStage, MiddlewareType } from '@owlmeans/context'
import type { BasicConfig, BasicContext } from '@owlmeans/context'
import { configureLog, overrideConsole, restoreConsole } from './logger.js'
import { logStateHelper } from './state.js'
import type { LogConfig } from './types.js'

const applied = new WeakSet<object>()

const apply = (cfg: BasicConfig): void => {
  configureLog(cfg.log)
  if (logStateHelper.state().consoleMode === 'native') {
    restoreConsole()
  } else {
    overrideConsole()
  }
}

/**
 * Put the process under the logging policy of `context.cfg.log` — the one call an application
 * context needs. The server and client context factories make it themselves.
 *
 * The policy is applied three times, because config arrives in three steps: at once (a browser's
 * build-time values are final, and the first render already logs), as a Config middleware (after
 * the file reader of a server context, in registration order) and again as a Context middleware,
 * which runs only after EVERY config middleware has finished — whichever reader resolved a path
 * to its value, that one has the last word.
 *
 * `defaults` fills only what `cfg.log` leaves out.
 */
export const appendLog = <C extends BasicConfig, T extends BasicContext<C>>(context: T, defaults?: LogConfig): T => {
  if (applied.has(context)) {
    return context
  }
  applied.add(context)

  if (defaults != null) {
    context.cfg.log = { ...defaults, ...context.cfg.log }
  }
  apply(context.cfg)

  context.registerMiddleware({
    type: MiddlewareType.Config,
    stage: MiddlewareStage.Configuration,
    apply: async ctx => { apply(ctx.cfg) },
  })
  context.registerMiddleware({
    type: MiddlewareType.Context,
    stage: MiddlewareStage.Configuration,
    apply: async ctx => { apply(ctx.cfg) },
  })

  return context
}
