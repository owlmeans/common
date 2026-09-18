
export const DEFAULT_ALIAS = 'queue'

/**
 * The state a job is in, as the broker reports it. `Waiting` covers both a job queued normally
 * and one held by an unfinished parent — the difference matters to the broker, never to a caller
 * asking whether an answer has arrived.
 */
export enum JobState {
  Waiting = 'waiting',
  Delayed = 'delayed',
  Active = 'active',
  Completed = 'completed',
  Failed = 'failed',
  Unknown = 'unknown',
}

/** A job has reached a state it will not leave on its own. */
export const isSettled = (state?: JobState): boolean =>
  state === JobState.Completed || state === JobState.Failed

export enum JobEventType {
  Completed = 'completed',
  Failed = 'failed',
  Progress = 'progress',
}

/**
 * How long a caller waits for a reply when neither the route nor the request says. Long enough
 * for work that talks to a model, short enough that a lost job surfaces as an error rather than a
 * hung request.
 */
export const DEFAULT_JOB_TIMEOUT = 60_000

/**
 * Retries default to one attempt: the jobs here are mostly LLM work, and a blind retry re-spends
 * the tokens that just failed. A queue whose jobs are cheap and idempotent raises it per queue.
 */
export const DEFAULT_ATTEMPTS = 1
