import type { JobRecord } from '@owlmeans/queue'
import { stateAlias } from '@owlmeans/state'
import type { StateAlias } from '@owlmeans/state'

/** The store this package registers and every hook here reads. */
export const JOBS: StateAlias<JobRecord> = stateAlias<JobRecord>('job-state')

/**
 * The alias root a group answers under when a caller names none — the same default
 * `@owlmeans/server-job` declares with.
 *
 * That package's `<root>` / `<root>:<verb>` alias shape and its `job-event` frame name are the
 * whole contract between the two halves. They are restated here rather than imported because the
 * server half pulls fastify in, and a browser bundle must not.
 */
export const DEFAULT_JOB_ROOT = 'jobs'

export const JOB_EVENT = 'job-event'
