import type { JobOptions, JobRecord, JobState } from '@owlmeans/queue'
import type { Job, JobProgress, JobsOptions } from 'bullmq'

/** Translation between a bullmq job and the queue contract's record and options. */
export interface JobRecordHelper {
  jobStateOf: (state: string) => JobState
  /**
   * `progress` and `data` cross the wire as JSON, so a progress value has to be something JSON can
   * carry. Checking it here turns a silent write of `undefined` into a refusal at the call site.
   *
   * @throws {UnsupportedArgumentError}
   */
  progressOf: (value: unknown) => JobProgress
  /** A job as the resource contract reads it. */
  jobRecordOf: <D, R>(queue: string, job: Job<D, R>, state?: JobState) => JobRecord<D, R>
  /**
   * The declared defaults, then the queue's, then what the caller asked for — each one only where it
   * says something, so a queue's default backoff survives a caller that only set a delay.
   */
  mergeJobOptions: (...sources: Array<JobOptions | undefined>) => JobOptions
  /**
   * Options as bullmq takes them. `attempts` is always written: bullmq's own default is one try and
   * so is the contract's, but leaving it implicit would make a queue's retry policy depend on which
   * of the two answered.
   */
  bullOptionsOf: (opts?: JobOptions) => JobsOptions
  /**
   * The bare id inside a bullmq job key (`<prefix>:<queue>:<id>`).
   *
   * Children are reported by key because a flow may span queues, while the contract reports them by
   * job id — which is the identity a caller already holds from `create` or `flow`.
   */
  idOfJobKey: (key: string) => string
  /** Re-key a children map from bullmq's job keys onto plain job ids. */
  byJobId: <T>(values: Record<string, T>) => Record<string, T>
}
