import { JobState } from '@owlmeans/queue'

/**
 * The broker's states, folded onto the five the contract names. Anything the broker adds later
 * reads as `Unknown` rather than as a state a caller would have to learn.
 */
export const STATES: Record<string, JobState> = {
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
