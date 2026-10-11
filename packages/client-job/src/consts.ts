import { type StateAlias, stateAlias } from '@owlmeans/state'
import type { JobView } from '@owlmeans/job'

/** The store this package registers and every hook here reads. */
export const JOBS: StateAlias<JobView> = stateAlias<JobView>('job-state')
