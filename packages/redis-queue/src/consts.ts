import type { JobType } from 'bullmq'

/**
 * What separates this driver's keys from the plain-record ones living under the same schema. A
 * queue is a set of lists, hashes and a stream rather than one document per key, so sharing a
 * namespace with `@owlmeans/redis-resource` would put both in the reach of the other's key walk.
 */
export const QUEUE_KEY_SUFFIX = 'queue'

/**
 * How long a job may hold its lock without reporting progress. Longer than bullmq's own 30s
 * because the work these queues carry is mostly model calls, where a single step that neither
 * fails nor answers for half a minute is ordinary rather than a sign of a dead worker.
 */
export const DEFAULT_LOCK_DURATION = 60_000

export const DEFAULT_STALLED_INTERVAL = 30_000

/**
 * How many times a job may come back from a stalled state. Two rather than bullmq's one: a worker
 * rolled out mid-job leaves its jobs stalled once through no fault of the job.
 */
export const DEFAULT_MAX_STALLED_COUNT = 2

/**
 * Every bullmq state a listing enumerates.
 *
 * The broker distinguishes more than the contract does: `prioritized` and `waiting-children` both
 * mean "queued, not started" to a caller asking whether an answer arrived. Listing state by state —
 * rather than reading each job's state afterwards — is what makes a listing one round trip per
 * state instead of one per job.
 *
 * `paused` is absent on purpose: bullmq widens a request for `waiting` to include it, so naming it
 * as well would read a paused queue's backlog twice.
 */
export const LISTED_STATES: JobType[] = [
  'waiting', 'waiting-children', 'prioritized', 'delayed', 'active', 'completed', 'failed'
]

/**
 * The event name a hand-published {@link JobEvent} travels under.
 *
 * It is deliberately NOT one of the broker's own names: a synthetic `completed` written into the
 * events stream would resolve every `wait()` watching that job with a result no processor ever
 * returned.
 */
export const PUBLISHED_EVENT = 'owlmeans:job-event'

/** How many entries the queue's event stream keeps when this driver writes to it. */
export const PUBLISHED_EVENT_MAX = 1000

/**
 * What bullmq's own wait puts in the message when the wait — not the job — ended.
 *
 * It rejects with a plain `Error` either way, and the two cases mean opposite things to a caller:
 * a failure is the processor's answer, a timeout leaves the job running. Reading the marker is
 * what separates them; asking redis for the job's state instead would answer about a moment later
 * than the one the wait ended in.
 */
export const WAIT_TIMEOUT_MARKER = 'timed out before finishing'

/**
 * The reason bullmq records when it fails a job that has stalled more times than the queue allows.
 * It is the only failure a job never chose — nothing ran and threw — so the hooks report it apart.
 */
export const STALLED_FAILURE = 'job stalled more than allowable limit'
