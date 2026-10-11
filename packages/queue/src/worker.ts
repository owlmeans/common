import type { Middleware } from '@owlmeans/context'
import { MiddlewareStage, MiddlewareType } from '@owlmeans/context'
import type { Config, Context, QueueWorkerService } from './types.js'
import { DEFAULT_ALIAS } from './consts.js'

/**
 * Start the worker once the context is ready.
 *
 * Ready stage, not Loading: processors are registered while the application wires itself up, and
 * binding the queues before that finished would take jobs this process cannot yet run. A process
 * that listens to nothing registers no worker at all, so a producer pays nothing for this.
 */
export const queueWorkerMiddleware = (alias: string = DEFAULT_ALIAS): Middleware => ({
  type: MiddlewareType.Context,
  stage: MiddlewareStage.Ready,
  apply: async context => {
    const ctx = context as unknown as Context<Config>
    if ((ctx.cfg.queue?.listen ?? []).length === 0) {
      return
    }
    if (!ctx.hasService(alias)) {
      return
    }

    await ctx.service<QueueWorkerService>(alias).start()
  }
})
