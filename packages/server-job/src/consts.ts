/**
 * The alias root a target app gets when its declaration names none, and the path segment the
 * group answers under.
 */
export const DEFAULT_JOB_ROOT = 'jobs'
export const DEFAULT_JOB_PATH = '/jobs'

/**
 * Where the owner is recorded inside a job's payload.
 *
 * A `JobRecord` has no owner column — the broker keeps only what the contract declares — so the
 * producer writes the subject into the job's own `data`, and every read here filters on
 * `data.<field>`. Change it per declaration when the app's payloads already name the subject
 * something else.
 */
export const DEFAULT_OWNER_FIELD = 'owner'

/**
 * The socket event a `JobEvent` frame is pushed under.
 *
 * This name, and the `<root>:<verb>` alias shape in `entrypoints.ts`, are the whole contract
 * between this package and `@owlmeans/client-job` — the two halves cannot share a module without
 * dragging fastify into a browser bundle, so they each state it and the skills pin it.
 */
export const JOB_EVENT = 'job-event'

/** Newest first: a job list is read to see what is happening now. */
export const DEFAULT_JOB_SORT = 'createdAt'
