import { assertContext, createService } from '@owlmeans/context'
import { ResilientError } from '@owlmeans/error'
import { DEFAULT_DB_ALIAS } from '@owlmeans/redis-resource'
import type { RedisDbService } from '@owlmeans/redis-resource'
import type { JobContext, JobProcessor, QueueHooks } from '@owlmeans/queue'
import {
  DEFAULT_ALIAS, DEFAULT_ATTEMPTS, entrypointProcessor, isListening, JobEventType, JobState,
  queueOf, QueueNotListening, servedJobs, UnknownJobName
} from '@owlmeans/queue'
import type { Job, WorkerOptions } from 'bullmq'
import { Queue, UnrecoverableError, Worker } from 'bullmq'
import type { Config, Context, RedisQueueWorkerService } from './types.js'
import {
  DEFAULT_LOCK_DURATION, DEFAULT_MAX_STALLED_COUNT, DEFAULT_STALLED_INTERVAL, STALLED_FAILURE
} from './consts.js'
import { byJobId, jobRecordOf, progressOf, queueConnection } from './utils/index.js'

/**
 * The consuming half.
 *
 * It binds one bullmq worker per queue named in `cfg.queue.listen` and dispatches by job name — to
 * a processor an application registered here, or to an entrypoint this process both serves and
 * listens to. A job name neither of them answers fails unrecoverably: nothing in this process can
 * ever run it, so retrying only moves the same failure further down the backlog.
 */
export const makeRedisQueueWorker = (
  alias: string = DEFAULT_ALIAS, dbAlias: string = DEFAULT_DB_ALIAS,
  serviceAlias: string = DEFAULT_DB_ALIAS
): RedisQueueWorkerService => {
  const location = `redis-queue-worker:${alias}`

  const processors = new Map<string, Map<string, JobProcessor<any, unknown>>>()
  const workers = new Map<string, Worker<unknown, unknown>>()
  const queues = new Map<string, Queue>()
  const aborts = new Map<string, AbortController>()

  let hooks: QueueHooks = {}
  let terminate: (() => void) | undefined

  const context = (): Context => assertContext<Config, Context>(service.ctx as Context, location)

  /** A hook is the application's business: a throwing one must not fail the job it reports on. */
  const report = (result: void | Promise<void> | undefined): void => {
    void Promise.resolve(result).catch(
      error => console.error(`${location}: queue hook failed`, error)
    )
  }

  /**
   * What a processor is handed.
   *
   * `touch` both reports progress and renews the lock. Only the second one matters to survival —
   * the broker judges liveness by the lock, and a processor that reported progress without
   * renewing would still be declared stalled and re-run somewhere else while it works.
   */
  const jobContext = <D>(
    queue: string, job: Job<D, unknown>, token: string | undefined, signal: AbortSignal,
    lockDuration: number
  ): JobContext<D> => ({
    id: job.id ?? '',
    name: job.name,
    queue,
    attempt: job.attemptsStarted,
    data: job.data,
    signal,

    touch: async () => {
      await job.updateProgress(job.progress)
      if (token != null) {
        await job.extendLock(token, lockDuration)
      }
    },

    progress: async value => {
      await job.updateProgress(progressOf(value))
    },

    children: async <T>() => byJobId(await job.getChildrenValues<T>()),

    failedChildren: async () => byJobId(await job.getIgnoredChildrenFailures()),
  })

  const dispatch = async (
    queue: string, job: Job<unknown, unknown>, token: string | undefined, signal: AbortSignal,
    lockDuration: number, entrypoints: Set<string>
  ): Promise<unknown> => {
    const registered = processors.get(queue)?.get(job.name)
    const processor: JobProcessor<any, unknown> | undefined = registered
      ?? (entrypoints.has(job.name) ? entrypointProcessor(context()) : undefined)

    if (processor == null) {
      // Marshalled inside an UnrecoverableError so that both readers get what they need: bullmq
      // sees a class that means "do not retry", the producer's `wait` rebuilds `UnknownJobName`.
      throw new UnrecoverableError(
        ResilientError.marshal(new UnknownJobName(`${queue}:${job.name}`)).message
      )
    }

    const handled = jobContext(queue, job, token, signal, lockDuration)
    const run = async (): Promise<unknown> => await processor(handled)

    try {
      return hooks.wrapHandler != null ? await hooks.wrapHandler(handled, run) : await run()
    } catch (e) {
      // A domain refusal has to cross the hop as the class it was thrown as. Marshalling it into
      // the failure reason is what lets `wait` rebuild it instead of handing back a string.
      if (e instanceof ResilientError) {
        throw new Error(ResilientError.marshal(e).message)
      }

      throw e
    }
  }

  /** Whether this failure is the job's last — retries spent, or a refusal to retry at all. */
  const settled = (job: Job<unknown, unknown>, error: Error): boolean =>
    error instanceof UnrecoverableError
    || error.message === STALLED_FAILURE
    || job.attemptsMade >= (job.opts.attempts ?? DEFAULT_ATTEMPTS)

  const observe = (queue: string, worker: Worker<unknown, unknown>): void => {
    worker.on('error', error => console.error(`${location}: ${queue} worker error`, error))

    worker.on('completed', (job, result) => {
      report(hooks.onJobResult?.({
        type: JobEventType.Completed, id: job.id ?? '', queue, name: job.name, result
      }))
    })

    worker.on('failed', (job, error) => {
      // bullmq reports a stalled job whose record it already dropped without the job itself.
      if (job == null) {
        return
      }
      report(hooks.onJobResult?.({
        type: JobEventType.Failed, id: job.id ?? '', queue, name: job.name, error: error.message
      }))
      if (error.message === STALLED_FAILURE) {
        report(hooks.onJobStalled?.({ id: job.id ?? '', queue, name: job.name }, 'failed'))
      }
      if (settled(job, error)) {
        report(hooks.onJobDead?.(jobRecordOf(queue, job, JobState.Failed), error.message))
      }
    })

    worker.on('stalled', jobId => {
      // The stalled report carries an id alone, and the hook describes a job — so the name comes
      // from the queue, and a job already gone is reported nameless rather than not at all.
      void queues.get(queue)?.getJob(jobId).then(
        job => report(hooks.onJobStalled?.(
          { id: jobId, queue, name: job?.name ?? '' }, 'stalled'
        ))
      ).catch(error => console.error(`${location}: ${queue} stalled report failed`, error))
    })
  }

  const optionsOf = (
    queue: string, connection: WorkerOptions['connection'], prefix: string, lockDuration: number
  ): WorkerOptions => {
    const declared = queueOf(context().cfg, queue).worker ?? {}
    const options: WorkerOptions = {
      connection,
      prefix,
      lockDuration,
      stalledInterval: declared.stalledInterval ?? DEFAULT_STALLED_INTERVAL,
      maxStalledCount: declared.maxStalledCount ?? DEFAULT_MAX_STALLED_COUNT,
      // Bound explicitly by `start()`: a worker that began consuming inside its constructor would
      // take jobs while the application is still registering the processors that run them.
      autorun: false,
    }
    // Written only when declared — bullmq's own default is applied by merging over the options
    // object, so an explicit `undefined` would erase it rather than leave it alone.
    if (declared.concurrency != null) {
      options.concurrency = declared.concurrency
    }

    return options
  }

  const service: RedisQueueWorkerService = createService<RedisQueueWorkerService>(alias, {
    hooks: next => {
      hooks = { ...hooks, ...next }
    },

    /**
     * @throws {QueueNotListening} when this process does not consume that queue — which queues it
     * consumes is configuration, so this is a deployment question rather than a code one.
     */
    process: (queue, name, processor) => {
      if (!isListening(context().cfg, queue)) {
        throw new QueueNotListening(`${queue}:${name}`)
      }
      const registered = processors.get(queue) ?? new Map<string, JobProcessor<any, unknown>>()
      registered.set(name, processor)
      processors.set(queue, registered)
    },

    /**
     * Bind every queue this process consumes. Idempotent: a queue already bound is left as it is,
     * so a second start after a late declaration adds only what is new.
     */
    start: async () => {
      const ctx = context()
      const listen = ctx.cfg.queue?.listen ?? []
      if (listen.length === 0) {
        return
      }

      const { client, blocking, prefix } = await queueConnection(
        ctx.service<RedisDbService>(serviceAlias), dbAlias
      )

      // Which entrypoints this process both SERVES and LISTENS to. Read once, here, because an
      // entrypoint elevated after the worker is bound was not part of what this process promised.
      const served = servedJobs(ctx)

      for (const name of listen) {
        if (workers.has(name)) {
          continue
        }
        const entrypoints = new Set((served.get(name) ?? []).map(entrypoint => entrypoint.alias))
        const lockDuration = queueOf(ctx.cfg, name).worker?.lockDuration ?? DEFAULT_LOCK_DURATION
        const controller = new AbortController()

        const worker = new Worker<unknown, unknown>(
          name,
          async (job, token) => await dispatch(
            name, job, token, controller.signal, lockDuration, entrypoints
          ),
          optionsOf(name, { ...blocking }, prefix, lockDuration)
        )
        observe(name, worker)

        queues.set(name, new Queue(name, { connection: client, prefix }))
        aborts.set(name, controller)
        workers.set(name, worker)

        void worker.run().catch(
          error => console.error(`${location}: ${name} stopped consuming`, error)
        )
      }

      if (terminate == null) {
        // A rollout is the ordinary way a worker ends, and an unclosed worker leaves its jobs to
        // be reclaimed as stalled. Stopping is all this does — exiting is the application's call.
        terminate = () => void service.stop()
        process.on('SIGTERM', terminate)
      }
    },

    /** Drains: `close` lets the jobs in flight finish before the connections go. */
    stop: async () => {
      for (const worker of workers.values()) {
        await worker.close()
      }
      aborts.forEach(controller => controller.abort())
      for (const bullQueue of queues.values()) {
        await bullQueue.close()
      }
      workers.clear()
      queues.clear()
      aborts.clear()
      if (terminate != null) {
        process.off('SIGTERM', terminate)
        terminate = undefined
      }
    },

    listening: () => [...workers.keys()],
  })

  return service
}
