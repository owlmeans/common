import type { QueueAppend, QueueResource } from '@owlmeans/queue'
import {
  appendQueueTransport, DEFAULT_ALIAS, queueOf, queueWorkerMiddleware, UnknownQueue
} from '@owlmeans/queue'
import { DEFAULT_DB_ALIAS } from '@owlmeans/redis-resource'
import { makeRedisQueueResource, queueResourceAlias } from './resource.js'
import { makeRedisQueueWorker } from './worker.js'
import type { Config, Context, RedisQueueOptions, RedisQueueResource } from './types.js'

/**
 * The queue `jobs()` means when it is asked for none.
 *
 * Only ever the single declared queue: with two, the one a caller meant would be whichever the
 * declaration order put first, and a queue added later would silently move every such call.
 *
 * @throws {UnknownQueue}
 */
const soleQueue = <C extends Config>(cfg: C): string => {
  const queues = cfg.queue?.queues ?? []
  if (queues.length !== 1) {
    throw new UnknownQueue(`no-default-queue:${queues.length}-declared`)
  }

  return queues[0].name
}

/**
 * Wire bullmq under the queue contract.
 *
 * The same call produces a producer or a worker: the resources and the transport are always
 * registered, while the worker service is registered only when this process was configured to
 * consume something. That is what lets one binary be deployed as either.
 */
export const appendRedisQueue = <C extends Config, T extends Context<C> = Context<C>>(
  context: T, opts?: RedisQueueOptions
): T => {
  const ctx = context as T & QueueAppend
  // Mixins compose, and a layer wired twice must not end up with two workers on one queue.
  if (ctx.jobs != null) {
    return ctx
  }

  const alias = opts?.alias ?? DEFAULT_ALIAS
  const serviceAlias = opts?.service ?? DEFAULT_DB_ALIAS
  const dbAlias = opts?.db ?? context.cfg.queue?.db ?? serviceAlias

  const opened: Array<() => Promise<void>> = []

  const bind = (queue: string): void => {
    const resource: RedisQueueResource = makeRedisQueueResource(queue, dbAlias, serviceAlias)
    ctx.registerResource(resource)
    opened.push(resource.close)
  }

  ;(context.cfg.queue?.queues ?? []).forEach(declaration => bind(declaration.name))

  ctx.jobs = <D, R>(queue?: string): QueueResource<D, R> => {
    const name = queue ?? soleQueue(ctx.cfg)
    // A queue nothing declared is a mistake at the call site, not an empty queue to produce into.
    queueOf(ctx.cfg, name)

    if (!ctx.hasResource(queueResourceAlias(name))) {
      bind(name)
    }

    return ctx.resource<RedisQueueResource<D, R>>(queueResourceAlias(name))
  }

  if ((context.cfg.queue?.listen ?? []).length > 0) {
    const worker = makeRedisQueueWorker(alias, dbAlias, serviceAlias)
    if (opts?.hooks != null) {
      worker.hooks(opts.hooks)
    }
    context.registerService(worker)
  }

  appendQueueTransport(context)
  context.registerMiddleware(queueWorkerMiddleware(alias))

  // The events consumer holds a blocking connection, so a process that produced into a queue does
  // not exit until it is released. Releasing is all this does — exiting stays the application's.
  process.on('SIGTERM', () => {
    void Promise.all(opened.map(async close => await close()))
  })

  return ctx
}
