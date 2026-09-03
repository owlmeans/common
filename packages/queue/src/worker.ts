import type { Middleware } from '@owlmeans/context'
import { MiddlewareStage, MiddlewareType, AppType } from '@owlmeans/context'
import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import { RouteProtocols } from '@owlmeans/route'
import type { Config, Context, JobContext, JobEnvelope, JobProcessor, QueueWorkerService } from './types.js'
import { handleJob } from './bridge.js'
import { DEFAULT_ALIAS } from './consts.js'

/**
 * Every queued entrypoint this process both SERVES and LISTENS to, grouped by queue.
 *
 * Both halves are required and they answer different questions. Serving is about code — the alias
 * was elevated here, so a handler exists. Listening is about deployment — this process was
 * configured to consume that queue. A worker that bound queues by what it can serve would make
 * every deployment of the same binary a worker for everything it happens to import.
 */
export const servedJobs = <C extends Config, T extends Context<C>>(
  context: T
): Map<string, CommonEntrypoint[]> => {
  const listen = context.cfg.queue?.listen ?? []
  const served = new Map<string, CommonEntrypoint[]>()

  context.entrypoints<CommonEntrypoint>().forEach(entrypoint => {
    const route = entrypoint.route.route
    if (route.type !== AppType.Backend || route.protocol !== RouteProtocols.QUEUE) {
      return
    }
    if (route.service != null && route.service !== context.cfg.service) {
      return
    }
    if (entrypoint.handle == null || route.queue == null || !listen.includes(route.queue)) {
      return
    }

    served.set(route.queue, [...(served.get(route.queue) ?? []), entrypoint])
  })

  return served
}

/**
 * A processor that runs a queued entrypoint call. The driver dispatches by job name, and an
 * entrypoint job's name IS its alias — which is what lets one worker carry both entrypoint jobs
 * and the internal steps an application registers with `process()`.
 */
export const entrypointProcessor = <C extends Config, T extends Context<C>>(
  context: T
): JobProcessor<JobEnvelope, unknown> =>
  async (job: JobContext<JobEnvelope>) => await handleJob(context, job)

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
