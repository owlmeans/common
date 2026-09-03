import type { BasicConfig, BasicContext, InitializedService } from '@owlmeans/context'
import type { PubSubResource, Resource, ResourceRecord } from '@owlmeans/resource'
import type { AbstractRequest, AbstractResponse } from '@owlmeans/entrypoint'
import type { JobEventType, JobState } from './consts.js'

/**
 * Everything the monorepo knows about its queues, declared in the shared backend package so that
 * producer and consumer read the same list. A process becomes a worker by naming queues in
 * `listen` — nothing in a declaration decides where it runs.
 */
export interface QueueConfig {
  queues?: QueueDeclaration[]
  /** The queues THIS process consumes. Absent or empty means producer only. */
  listen?: string[]
  /** Which db service carries the queues. Defaults to the queue service's own alias. */
  db?: string
  defaults?: JobOptions
  /**
   * How long a signed job envelope stays acceptable, in seconds. It bounds both the freshness
   * check and the nonce cache, so a job delayed behind a long backlog is still admitted.
   */
  envelopeTtl?: number
}

export interface QueueDeclaration {
  name: string
  /**
   * The job names this queue accepts. A job the queue does not declare is refused at enqueue
   * time rather than becoming a job nothing can process.
   */
  jobs: string[]
  worker?: QueueWorkerOptions
  defaults?: JobOptions
}

export interface QueueWorkerOptions {
  concurrency?: number
  /**
   * How long a job may hold its lock without reporting progress. A processor that runs longer
   * than this between `touch()` calls is treated as stalled and its job is handed to someone else.
   */
  lockDuration?: number
  stalledInterval?: number
  maxStalledCount?: number
}

export interface JobOptions {
  attempts?: number
  backoff?: { type: 'fixed' | 'exponential', delay: number }
  delay?: number
  priority?: number
  /**
   * A caller-chosen identity for the job. Enqueueing the same id twice while the first is still
   * around is a no-op, which is what makes an admission step safe to retry.
   */
  id?: string
  removeOnComplete?: boolean | number
  removeOnFail?: boolean | number
}

/**
 * A job as a RECORD — the same shape the resource contract reads and writes, so inspecting a
 * queue is `list`/`get`/`count` rather than a broker-specific API.
 */
export interface JobRecord<D = unknown, R = unknown> extends ResourceRecord {
  queue: string
  name: string
  data: D
  state?: JobState
  result?: R
  error?: string
  attempts?: number
  progress?: unknown
  parentId?: string
  createdAt?: string
  startedAt?: string
  finishedAt?: string
  opts?: JobOptions
}

export interface JobEvent<R = unknown> {
  type: JobEventType
  id: string
  queue: string
  /**
   * Empty when the job is already gone. A broker's completion event carries only an id, so the
   * name is read back from the job — and a queue that removes jobs on completion has nothing left
   * to read. Subscribe for the id and the outcome; do not branch on the name.
   */
  name: string
  result?: R
  error?: string
  progress?: unknown
}

/** A node of a job graph: children run first, siblings run together. */
export interface FlowSpec<D = unknown> {
  name: string
  queue?: string
  data: D
  opts?: JobOptions
  children?: FlowSpec[]
}

/**
 * One queue, addressed as a resource.
 *
 * `create` enqueues, `get`/`load`/`list`/`count` inspect, `delete`/`take` cancel. What the base
 * contract cannot express — waiting for an answer, submitting a graph, releasing the connection —
 * is added here.
 *
 * Three places where the base `Resource` contract reads differently against a broker, because a
 * job is not a row:
 * - `create` does NOT throw `RecordExists` for a repeated `opts.id`. Re-enqueueing an id that is
 *   still around returns the existing job, which is the idempotency that makes an admission step
 *   safe to retry.
 * - `WriteOptions.ttl` is refused. A job's lifetime is `removeOnComplete`/`removeOnFail` —
 *   explicit deletion once it has finished, not expiry while it waits.
 * - `update`/`save` reach only the job's `data`. Everything else about a job belongs to the
 *   broker, and an implementation refuses rather than pretending to write it.
 */
export interface QueueResource<D = unknown, R = unknown>
  extends Resource<JobRecord<D, R>>, PubSubResource<JobEvent<R>> {
  queue: string
  /**
   * Release the connections this queue holds.
   *
   * Watching for completions means a blocking connection, and a process that never releases it
   * does not exit. Nothing else in the resource contract can express that, so it lives here and a
   * producer calls it on shutdown.
   */
  close: () => Promise<void>
  /**
   * Wait for a job's return value.
   * @throws {QueueTimeout} when the wait elapses — the job itself is left alone.
   * @throws the processor's own error, rebuilt as its original class.
   */
  wait: (id: string, opts?: { timeout?: number }) => Promise<R>
  /** Submit a graph and get its root back. Children complete before their parent starts. */
  flow: (root: FlowSpec<D>) => Promise<JobRecord<D, R>>
  counts: () => Promise<Record<JobState, number>>
}

/**
 * What a processor is handed. `data` is the job's payload; everything else is the means to stay
 * alive and to read what the children reported.
 */
export interface JobContext<D = unknown> {
  id: string
  name: string
  queue: string
  attempt: number
  data: D
  signal: AbortSignal
  /**
   * Renew the lock. A processor that runs a long loop MUST call it as it goes: the broker judges
   * liveness by the lock, so silence for longer than `lockDuration` is indistinguishable from a
   * dead worker, and the job is re-run somewhere else while this one is still working on it.
   */
  touch: () => Promise<void>
  progress: (value: unknown) => Promise<void>
  /**
   * What the children returned, keyed by child job id.
   *
   * A broker keys them by its own fully qualified job key; an implementation re-keys to the bare
   * id, so two children of one parent that live in DIFFERENT queues and happen to share an id
   * collide here. Give the children of a cross-queue flow distinct ids.
   */
  children: <T = unknown>() => Promise<Record<string, T>>
  failedChildren: () => Promise<Record<string, string>>
}

export interface JobProcessor<D = unknown, R = unknown> {
  (job: JobContext<D>): Promise<R>
}

/**
 * The consuming half. It is registered only in processes that consume: `start()` binds the
 * queues named in `cfg.listen` and dispatches by job name, to a processor registered here or to
 * an entrypoint served in this process.
 */
export interface QueueWorkerService extends InitializedService {
  process: <D, R>(queue: string, name: string, processor: JobProcessor<D, R>) => void
  start: () => Promise<void>
  stop: () => Promise<void>
  /** The queues this process actually consumes. Empty in a producer. */
  listening: () => string[]
  /**
   * Bind the application's reactions to job lifecycle events. Registering more than once merges,
   * so an application composed of several parts can each contribute what it cares about.
   *
   * It belongs on the contract rather than on a driver because `onJobDead` is where an
   * application COMPENSATES — releases the lock the admission step took, marks the record failed —
   * and that behaviour must not have to be rewritten when the broker changes.
   */
  hooks: (hooks: QueueHooks) => void
}

/**
 * The envelope a queued entrypoint call travels in. It is the request, minus everything that only
 * means something to HTTP — the transport rebuilds a request from it on the far side.
 */
export interface JobEnvelope {
  alias: string
  params?: Record<string, unknown>
  body?: unknown
  query?: Record<string, unknown>
  headers?: Record<string, string | undefined>
  /** When the producer enqueued it — freshness is judged here, not at processing time. */
  enqueuedAt?: string
}

/** What a processor returns for an entrypoint job, so the caller can rebuild the reply. */
export interface JobReply<T = unknown> {
  value?: T
  outcome?: string
  error?: unknown
}

export interface QueueHooks {
  wrapHandler?: (job: JobContext, next: () => Promise<unknown>) => Promise<unknown>
  onJobResult?: (event: JobEvent) => void | Promise<void>
  onJobStalled?: (meta: { id: string, queue: string, name: string }, phase: 'stalled' | 'failed') => void | Promise<void>
  /**
   * The job is finished for good — retries exhausted, or it was dropped. This is where an
   * application compensates: release the lock the admission step took, mark the record failed.
   */
  onJobDead?: (job: JobRecord, reason: string) => void | Promise<void>
}

export interface QueueDriver {
  resource: <D, R>(queue: string) => QueueResource<D, R>
  worker: () => QueueWorkerService
}

export interface Config extends BasicConfig {
  queue?: QueueConfig
}

export interface Context<C extends Config = Config> extends BasicContext<C> {
}

export interface QueueAppend {
  jobs: <D = unknown, R = unknown>(queue?: string) => QueueResource<D, R>
}

export interface QueueTransportRequest extends AbstractRequest {
}

export interface QueueTransportResponse extends AbstractResponse<unknown> {
}
