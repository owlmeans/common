import type { JobOptions, JobRecord } from '@owlmeans/queue'
import { DEFAULT_ATTEMPTS, JobState } from '@owlmeans/queue'
import { UnsupportedArgumentError } from '@owlmeans/resource'
import type { Job, JobProgress, JobsOptions } from 'bullmq'

/**
 * The broker's states, folded onto the five the contract names. Anything the broker adds later
 * reads as `Unknown` rather than as a state a caller would have to learn.
 */
const STATES: Record<string, JobState> = {
  waiting: JobState.Waiting,
  wait: JobState.Waiting,
  'waiting-children': JobState.Waiting,
  prioritized: JobState.Waiting,
  paused: JobState.Waiting,
  delayed: JobState.Delayed,
  active: JobState.Active,
  completed: JobState.Completed,
  failed: JobState.Failed,
}

export const jobStateOf = (state: string): JobState => STATES[state] ?? JobState.Unknown

/** A bullmq timestamp is milliseconds, and `0` is how it says "never happened". */
const instant = (value?: number): string | undefined =>
  value == null || value === 0 ? undefined : new Date(value).toISOString()

/**
 * `progress` and `data` cross the wire as JSON, so a progress value has to be something JSON can
 * carry. Checking it here turns a silent write of `undefined` into a refusal at the call site.
 *
 * @throws {UnsupportedArgumentError}
 */
export const progressOf = (value: unknown): JobProgress => {
  if (value == null) {
    throw new UnsupportedArgumentError('progress:empty')
  }
  if (typeof value === 'string' || typeof value === 'boolean' || typeof value === 'number'
    || typeof value === 'object') {
    return value
  }

  throw new UnsupportedArgumentError(`progress:${typeof value}`)
}

/**
 * Back to the options the contract can express. A retention or backoff shape only bullmq
 * understands is left out rather than approximated — a record that reported `removeOnComplete: 10`
 * for `{ age: 10 }` would be read as a count.
 */
const jobOptionsOf = (opts: JobsOptions): JobOptions => {
  const result: JobOptions = {}

  if (opts.attempts != null) result.attempts = opts.attempts
  if (typeof opts.backoff === 'object'
    && (opts.backoff.type === 'fixed' || opts.backoff.type === 'exponential')) {
    result.backoff = {
      // Written back as a literal: bullmq's own strategy name widens to any string so a queue may
      // register its own, and the contract knows only these two.
      type: opts.backoff.type === 'fixed' ? 'fixed' : 'exponential',
      delay: opts.backoff.delay ?? 0
    }
  }
  if (opts.delay != null) result.delay = opts.delay
  if (opts.priority != null) result.priority = opts.priority
  if (opts.jobId != null) result.id = opts.jobId
  if (typeof opts.removeOnComplete === 'boolean' || typeof opts.removeOnComplete === 'number') {
    result.removeOnComplete = opts.removeOnComplete
  }
  if (typeof opts.removeOnFail === 'boolean' || typeof opts.removeOnFail === 'number') {
    result.removeOnFail = opts.removeOnFail
  }

  return result
}

/** A job as the resource contract reads it. */
export const jobRecordOf = <D, R>(
  queue: string, job: Job<D, R>, state?: JobState
): JobRecord<D, R> => ({
  id: job.id,
  queue,
  name: job.name,
  data: job.data,
  state,
  result: job.returnvalue ?? undefined,
  error: typeof job.failedReason === 'string' && job.failedReason !== ''
    ? job.failedReason : undefined,
  attempts: job.attemptsMade,
  progress: job.progress,
  parentId: job.parent?.id,
  createdAt: instant(job.timestamp),
  startedAt: instant(job.processedOn),
  finishedAt: instant(job.finishedOn),
  opts: jobOptionsOf(job.opts),
})

/**
 * The declared defaults, then the queue's, then what the caller asked for — each one only where it
 * says something, so a queue's default backoff survives a caller that only set a delay.
 */
export const mergeJobOptions = (...sources: Array<JobOptions | undefined>): JobOptions =>
  sources.reduce<JobOptions>((merged, source) => ({ ...merged, ...source }), {})

/**
 * Options as bullmq takes them. `attempts` is always written: bullmq's own default is one try and
 * so is the contract's, but leaving it implicit would make a queue's retry policy depend on which
 * of the two answered.
 */
export const bullOptionsOf = (opts?: JobOptions): JobsOptions => {
  const result: JobsOptions = { attempts: opts?.attempts ?? DEFAULT_ATTEMPTS }

  if (opts?.backoff != null) result.backoff = opts.backoff
  if (opts?.delay != null) result.delay = opts.delay
  if (opts?.priority != null) result.priority = opts.priority
  if (opts?.id != null) result.jobId = opts.id
  if (opts?.removeOnComplete != null) result.removeOnComplete = opts.removeOnComplete
  if (opts?.removeOnFail != null) result.removeOnFail = opts.removeOnFail

  return result
}

/**
 * The bare id inside a bullmq job key (`<prefix>:<queue>:<id>`).
 *
 * Children are reported by key because a flow may span queues, while the contract reports them by
 * job id — which is the identity a caller already holds from `create` or `flow`.
 */
export const idOfJobKey = (key: string): string => key.slice(key.lastIndexOf(':') + 1)

/** Re-key a children map from bullmq's job keys onto plain job ids. */
export const byJobId = <T>(values: Record<string, T>): Record<string, T> =>
  Object.entries(values).reduce<Record<string, T>>(
    (result, [key, value]) => ({ ...result, [idOfJobKey(key)]: value }), {}
  )
