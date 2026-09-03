import type {
  Criteria, FirstOptions, ListOptions, ListResult, SubscribeOptions, Ttl, Unsubscribe, WriteOptions
} from '@owlmeans/resource'
import {
  applyQuery, filterRecords, firstMatch, MisshapedRecord, UnsupportedArgumentError,
  UnsupportedMethodError
} from '@owlmeans/resource'
import { DEFAULT_DB_ALIAS } from '@owlmeans/redis-resource'
import type { RedisDbService } from '@owlmeans/redis-resource'
import type { FlowSpec, JobEvent, JobRecord } from '@owlmeans/queue'
import {
  DEFAULT_ALIAS, DEFAULT_JOB_TIMEOUT, JobEventType, JobState, QueueTimeout, UnknownJob
} from '@owlmeans/queue'
import { appendContextual, assertContext } from '@owlmeans/context'
import { ResilientError } from '@owlmeans/error'
import type { Job, QueueEventsListener } from 'bullmq'
import { FlowProducer, Queue, QueueEvents, QueueEventsProducer } from 'bullmq'
import type { Config, Context, RedisQueueResource } from './types.js'
import {
  LISTED_STATES, PUBLISHED_EVENT, PUBLISHED_EVENT_MAX, WAIT_TIMEOUT_MARKER
} from './consts.js'
import {
  bullOptionsOf, declaredJob, flowJobOf, jobRecordOf, jobStateOf, mergeJobOptions, queueConnection
} from './utils/index.js'

/**
 * The queue named by the job type it carries rather than by the payload type.
 *
 * bullmq derives its data, result and name types from the first argument, and it derives them
 * through a conditional that a bare type parameter leaves unresolved — naming the job itself is
 * what lets `add` and `getJob` speak in `D` and `R` instead of in `any`.
 */
type JobQueue<D, R> = Queue<Job<D, R, string>>

/** The resource alias one queue is registered under. */
export const queueResourceAlias = (queue: string): string => `${DEFAULT_ALIAS}:${queue}`

/**
 * An event this driver published itself, carried under a name of its own so that a hand-made
 * event can never be mistaken for one the broker wrote.
 */
interface PublishedListener extends QueueEventsListener {
  [PUBLISHED_EVENT]: (args: { payload: string }, id: string) => void
}

/**
 * One bullmq queue, addressed as a resource.
 *
 * Reads by id are one round trip; a criteria read, a listing, a count and a purge enumerate the
 * queue state by state and evaluate the criteria in memory, because a queue has no index to ask.
 * That is affordable for inspecting a queue and wrong as a data access path — a backlog large
 * enough to need a query is a backlog that belongs in a store, not in a broker.
 *
 * Connections are opened on first use, never at registration: a process that declares ten queues
 * and produces into one should hold one connection, not ten.
 */
export const makeRedisQueueResource = <D = unknown, R = unknown>(
  queue: string, dbAlias: string = DEFAULT_DB_ALIAS, serviceAlias: string = DEFAULT_DB_ALIAS
): RedisQueueResource<D, R> => {
  const location = `redis-queue:${queue}`

  let connection: Promise<Awaited<ReturnType<typeof queueConnection>>> | undefined
  let bull: Promise<JobQueue<D, R>> | undefined
  let events: Promise<QueueEvents> | undefined
  let flow: Promise<FlowProducer> | undefined
  let publisher: Promise<QueueEventsProducer> | undefined

  const context = (): Context => assertContext<Config, Context>(resource.ctx as Context, location)

  /**
   * Every bullmq object is an EventEmitter that reports connection trouble as an `error` event,
   * and an emitter without an `error` listener throws the error at the process instead.
   */
  const watched = <T extends { on: (event: 'error', listener: (error: Error) => void) => unknown }>(
    subject: T
  ): T => {
    subject.on('error', error => console.error(`${location}: connection error`, error))

    return subject
  }

  const connect = async (): Promise<Awaited<ReturnType<typeof queueConnection>>> => {
    if (connection == null) {
      const redis = context().service<RedisDbService>(serviceAlias)
      connection = queueConnection(redis, dbAlias).catch(error => {
        connection = undefined
        throw error
      })
    }

    return await connection
  }

  /** The queue itself rides the pooled client: everything it does is a command and a reply. */
  const bullQueue = async (): Promise<JobQueue<D, R>> => {
    if (bull == null) {
      bull = connect().then(({ client, prefix }) =>
        watched(new Queue<Job<D, R, string>>(queue, { connection: client, prefix }))
      )
    }

    return await bull
  }

  /** The events consumer blocks on a stream read, so it gets a connection of its own. */
  const bullEvents = async (): Promise<QueueEvents> => {
    if (events == null) {
      events = connect().then(
        ({ blocking, prefix }) => watched(new QueueEvents(queue, { connection: blocking, prefix }))
      )
    }

    return await events
  }

  const bullFlow = async (): Promise<FlowProducer> => {
    if (flow == null) {
      flow = connect().then(
        ({ client, prefix }) => watched(new FlowProducer({ connection: client, prefix }))
      )
    }

    return await flow
  }

  const bullPublisher = async (): Promise<QueueEventsProducer> => {
    if (publisher == null) {
      publisher = connect().then(
        ({ client, prefix }) => watched(new QueueEventsProducer(queue, { connection: client, prefix }))
      )
    }

    return await publisher
  }

  const readJob = async (id: string): Promise<JobRecord<D, R> | null> => {
    const job = await (await bullQueue()).getJob(id)

    return job == null ? null : jobRecordOf(queue, job, jobStateOf(await job.getState()))
  }

  /**
   * The whole queue as records, gathered state by state. `waiting` also covers a paused queue's
   * backlog — bullmq widens it — so the states are read exactly once each.
   */
  const readAll = async (): Promise<Array<JobRecord<D, R>>> => {
    const bullQ = await bullQueue()
    const records: Array<JobRecord<D, R>> = []
    for (const state of LISTED_STATES) {
      const jobs = await bullQ.getJobs([state])
      jobs.forEach(job => records.push(jobRecordOf(queue, job, jobStateOf(state))))
    }

    return records
  }

  /** `{ id: 'x' }` is the one criteria the broker can answer by key; anything else needs the walk. */
  const soleId = (where: Criteria<any>): string | null => {
    const keys = Object.keys(where)

    return keys.length === 1 && keys[0] === 'id' && typeof where.id === 'string' ? where.id : null
  }

  const loadOne = async (
    idOrWhere: string | Criteria<any>, opts?: FirstOptions<any>
  ): Promise<JobRecord<D, R> | null> => {
    const id = typeof idOrWhere === 'string' ? idOrWhere : soleId(idOrWhere)
    if (id != null) {
      return await readJob(id)
    }

    return firstMatch(await readAll(), idOrWhere as Criteria<any>, opts)
  }

  /** Close a subscription once its lifetime runs out — seconds from now, or an instant. */
  const armTtl = (close: Unsubscribe, ttl?: Ttl): void => {
    if (ttl == null) {
      return
    }
    setTimeout(() => void close(), ttl instanceof Date ? ttl.getTime() - Date.now() : ttl * 1000)
  }

  /**
   * The broker reports a finished job by id alone, while the contract's event carries the job's
   * name. Reading the job back is one round trip per event on an observer path, and it is the only
   * place the name still exists — a queue that removes its completed jobs answers with nothing,
   * which is why an absent job yields an empty name rather than dropping the event.
   */
  const nameOf = async (id: string): Promise<string> =>
    (await (await bullQueue()).getJob(id))?.name ?? ''

  const resource: RedisQueueResource<D, R> = appendContextual<RedisQueueResource<D, R>>(
    queueResourceAlias(queue), {
    queue,

    /**
     * @throws {UnknownJob}
     */
    get: async (idOrWhere: string | Criteria<any>, opts?: FirstOptions<any>) => {
      const record = await loadOne(idOrWhere, opts)
      if (record == null) {
        throw new UnknownJob(
          `${queue}:${typeof idOrWhere === 'string' ? idOrWhere : JSON.stringify(idOrWhere)}`
        )
      }

      return record
    },

    load: loadOne,

    /**
     * Unpaged by default, as every redis backed listing here is: without a `size` every match
     * comes back. A `page` on its own is a caller error rather than a window over an implied
     * default — there is no default here to take a window of.
     *
     * @throws {UnsupportedArgumentError} on `page` without `size`.
     */
    list: async (
      where?: Criteria<any>, opts?: ListOptions<any>
    ): Promise<ListResult<JobRecord<D, R>>> => {
      if (opts?.page != null && opts.size == null) {
        throw new UnsupportedArgumentError('page-without-size')
      }

      return applyQuery(await readAll(), where, opts)
    },

    count: async (where?: Criteria<any>): Promise<number> => {
      if (where == null || Object.keys(where).length < 1) {
        return await (await bullQueue()).getJobCountByTypes(...LISTED_STATES)
      }

      return filterRecords(await readAll(), where).length
    },

    /**
     * Enqueue.
     *
     * A job carrying an id that is still in the queue is NOT an error: the id is what makes an
     * admission step safe to retry, so bullmq hands back the job already there and this returns
     * it. Absence of a `RecordExists` here is the deliberate difference from every other resource.
     *
     * @throws {UnknownQueue} {@link UnknownJobName} {@link MisshapedRecord}
     * @throws {UnsupportedArgumentError} on a `ttl` — a job expires by retention, not by clock.
     */
    create: async (
      record: Partial<JobRecord<D, R>>, opts?: WriteOptions
    ): Promise<JobRecord<D, R>> => {
      if (opts?.ttl != null) {
        throw new UnsupportedArgumentError('create:ttl')
      }
      const data = record.data
      if (data === undefined) {
        throw new MisshapedRecord('data')
      }

      const declared = declaredJob(
        context().cfg, queue, record.name,
        mergeJobOptions(record.id != null ? { id: record.id } : undefined, record.opts)
      )

      const job = await (await bullQueue()).add(declared.name, data, bullOptionsOf(declared.opts))

      // Freshly added, so the state is what the options say rather than something to read back:
      // a delayed job waits on its timer, everything else waits for a worker.
      return jobRecordOf(
        queue, job, (declared.opts.delay ?? 0) > 0 ? JobState.Delayed : JobState.Waiting
      )
    },

    /**
     * A queued job is not a mutable record — its state, its result and its attempts belong to the
     * broker — so the one thing an update may rewrite is the payload the processor has not read
     * yet.
     *
     * @throws {MisshapedRecord} without an id, {@link UnknownJob} when the id is absent.
     * @throws {UnsupportedMethodError} when the record carries no new data.
     */
    update: async (record: Partial<JobRecord<D, R>>): Promise<JobRecord<D, R>> => {
      if (record.id == null) {
        throw new MisshapedRecord('id')
      }
      const data = record.data
      if (data === undefined) {
        throw new UnsupportedMethodError('update:data-only')
      }

      const job = await (await bullQueue()).getJob(record.id)
      if (job == null) {
        throw new UnknownJob(`${queue}:${record.id}`)
      }

      await job.updateData(data)

      return jobRecordOf(queue, job, jobStateOf(await job.getState()))
    },

    /** Enqueues when the id is free, rewrites the payload when it is taken. */
    save: async (record: Partial<JobRecord<D, R>>, opts?: WriteOptions) => {
      if (record.id == null) {
        return await resource.create(record, opts)
      }
      const job = await (await bullQueue()).getJob(record.id)

      return job == null ? await resource.create(record, opts) : await resource.update(record, opts)
    },

    /** Cancel: the job and its children leave the queue, and what was cancelled comes back. */
    delete: async (id: string): Promise<JobRecord<D, R> | null> => {
      const job = await (await bullQueue()).getJob(id)
      if (job == null) {
        return null
      }
      const record = jobRecordOf(queue, job, jobStateOf(await job.getState()))
      await job.remove()

      return record
    },

    /**
     * @throws {UnknownJob}
     */
    take: async (id: string): Promise<JobRecord<D, R>> => {
      const record = await resource.delete(id)
      if (record == null) {
        throw new UnknownJob(`${queue}:${id}`)
      }

      return record
    },

    /**
     * Bulk cancel. An empty criteria object is refused — emptying a queue is `obliterate`'s job,
     * not something a filter that came back empty should do.
     *
     * @throws {UnsupportedArgumentError} on empty criteria.
     */
    purge: async (where: Criteria<any>): Promise<number> => {
      if (where == null || Object.keys(where).length < 1) {
        throw new UnsupportedArgumentError('purge:empty-criteria')
      }
      const bullQ = await bullQueue()
      const matched = filterRecords(await readAll(), where)

      let removed = 0
      for (const record of matched) {
        if (record.id == null) {
          continue
        }
        const job = await bullQ.getJob(record.id)
        if (job == null) {
          continue
        }
        await job.remove()
        removed += 1
      }

      return removed
    },

    /**
     * Wait for a job's return value.
     *
     * The wait survives a job that finished before it started: bullmq subscribes first and then
     * reads the finished state, so nothing falls between the two. What it cannot survive is a job
     * REMOVED after finishing — the result is gone with it — which is why this driver leaves
     * completed jobs in place unless a queue asks otherwise.
     *
     * @throws {UnknownJob} {@link QueueTimeout}, and the processor's own error as its own class.
     */
    wait: async (id: string, opts?: { timeout?: number }): Promise<R> => {
      const timeout = opts?.timeout ?? DEFAULT_JOB_TIMEOUT
      const job = await (await bullQueue()).getJob(id)
      if (job == null) {
        throw new UnknownJob(`${queue}:${id}`)
      }

      try {
        return await job.waitUntilFinished(await bullEvents(), timeout)
      } catch (e) {
        const error = e instanceof Error ? e : new Error(`${e}`)
        if (error.message.includes(WAIT_TIMEOUT_MARKER)) {
          throw new QueueTimeout(`${queue}:${id}:${timeout}ms`)
        }

        throw ResilientError.ensure(error)
      }
    },

    /**
     * Submit a graph. The root comes back waiting on its children, and every child was already
     * given `ignoreDependencyOnFailure` on the way in.
     */
    flow: async (root: FlowSpec<D>): Promise<JobRecord<D, R>> => {
      const node = await (await bullFlow()).add(flowJobOf(context().cfg, root, queue))

      return jobRecordOf(queue, node.job, JobState.Waiting)
    },

    counts: async (): Promise<Record<JobState, number>> => {
      const raw = await (await bullQueue()).getJobCounts(...LISTED_STATES)
      const counts: Record<JobState, number> = {
        [JobState.Waiting]: 0,
        [JobState.Delayed]: 0,
        [JobState.Active]: 0,
        [JobState.Completed]: 0,
        [JobState.Failed]: 0,
        [JobState.Unknown]: 0,
      }
      Object.entries(raw).forEach(([type, count]) => {
        counts[jobStateOf(type)] += count
      })

      return counts
    },

    /**
     * Put an event on the queue's event stream by hand — a progress ping from something that is
     * not the processor, a synthetic result an operator injected.
     *
     * It travels under this driver's own event name, never under `completed` or `failed`: a
     * synthetic broker event would settle every `wait()` watching that job.
     *
     * @throws {UnsupportedArgumentError} on a channel — a queue has exactly one event stream.
     */
    publish: async (value: JobEvent<R>, channel?: string): Promise<void> => {
      if (channel != null) {
        throw new UnsupportedArgumentError('publish:channel')
      }

      await (await bullPublisher()).publishEvent(
        { eventName: PUBLISHED_EVENT, jobId: value.id, payload: JSON.stringify(value) },
        PUBLISHED_EVENT_MAX
      )
    },

    /**
     * Every job event this queue produces, plus the ones published through `publish`.
     *
     * @throws {UnsupportedArgumentError} on a channel.
     */
    subscribe: async (
      handler: (value: JobEvent<R>) => void | Promise<void>, opts?: SubscribeOptions
    ): Promise<Unsubscribe> => {
      if (opts?.channel != null) {
        throw new UnsupportedArgumentError('subscribe:channel')
      }

      const stream = await bullEvents()
      let closed = false

      const unsubscribe: Unsubscribe = async () => {
        if (closed) {
          return
        }
        closed = true
        stream.off('completed', onCompleted)
        stream.off('failed', onFailed)
        stream.off('progress', onProgress)
        stream.off<PublishedListener>(PUBLISHED_EVENT, onPublished)
      }

      const deliver = (event: JobEvent<R>): void => {
        if (closed) {
          return
        }
        /**
         * `once` closes before the handler's own work finishes on purpose: the handler may await a
         * read, and a second event arriving meanwhile would fire a subscription that has already
         * delivered its one event.
         */
        if (opts?.once === true) {
          void unsubscribe()
        }
        void handler(event)
      }

      const onCompleted = ({ jobId, returnvalue }: { jobId: string, returnvalue: string }): void => {
        void nameOf(jobId).then(name => deliver({
          type: JobEventType.Completed, id: jobId, queue, name,
          // The events consumer JSON-parses `returnvalue` before it reaches a listener, while the
          // published typing still describes the raw stream field as a string.
          result: returnvalue as unknown as R
        }))
      }

      const onFailed = ({ jobId, failedReason }: { jobId: string, failedReason: string }): void => {
        void nameOf(jobId).then(name => deliver({
          type: JobEventType.Failed, id: jobId, queue, name, error: failedReason
        }))
      }

      const onProgress = ({ jobId, data }: { jobId: string, data: unknown }): void => {
        void nameOf(jobId).then(name => deliver({
          type: JobEventType.Progress, id: jobId, queue, name, progress: data
        }))
      }

      const onPublished = ({ payload }: { payload: string }): void => {
        deliver(JSON.parse(payload))
      }

      stream.on('completed', onCompleted)
      stream.on('failed', onFailed)
      stream.on('progress', onProgress)
      stream.on<PublishedListener>(PUBLISHED_EVENT, onPublished)
      armTtl(unsubscribe, opts?.ttl)

      return unsubscribe
    },

    /**
     * Release what this resource opened. The pooled client is left alone — it belongs to the redis
     * service — while the events consumer's own connection is closed, which is what lets a process
     * that used a queue exit.
     */
    close: async (): Promise<void> => {
      const pending: Array<Promise<{ close: () => Promise<void> }> | undefined> =
        [events, publisher, flow, bull]
      events = undefined
      publisher = undefined
      flow = undefined
      bull = undefined
      connection = undefined

      for (const opened of pending) {
        if (opened == null) {
          continue
        }
        try {
          await (await opened).close()
        } catch (error) {
          console.error(`${location}: failed to close`, error)
        }
      }
    }
    // The reads are overloaded — an id or a criteria object — and an object literal cannot be
    // checked against an overload set, so the literal is asserted once here rather than each
    // member being cast on its own.
  } as unknown as Partial<RedisQueueResource<D, R>>)

  return resource
}
