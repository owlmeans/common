import type { JobView } from '@owlmeans/job'
import { stateAlias } from '@owlmeans/state'
import type { StateAlias } from '@owlmeans/state'

/** The store this package registers and every hook here reads. */
export const JOBS: StateAlias<JobView> = stateAlias<JobView>('job-state')
