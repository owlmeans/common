import { JobState } from './consts.js'

/** A job has reached a state it will not leave on its own. */
export const isSettled = (state?: JobState): boolean =>
  state === JobState.Completed || state === JobState.Failed
