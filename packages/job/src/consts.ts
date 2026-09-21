export const DEFAULT_JOB_ROOT = 'jobs'
export const DEFAULT_JOB_PATH = '/jobs'
export const JOB_EVENT = 'job-event'

export enum JobViewStatus {
  Queued = 'queued',
  Running = 'running',
  Succeeded = 'succeeded',
  Failed = 'failed',
  Cancelled = 'cancelled',
}
