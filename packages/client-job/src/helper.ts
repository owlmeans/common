import { appendStateResource } from '@owlmeans/state'
import type { StateAlias } from '@owlmeans/state'
import type { JobRecord } from '@owlmeans/queue'
import { DEFAULT_JOB_ROOT, JOBS } from './consts.js'
import type { Config, Context, JobEntrypointAliases } from './types.js'

/**
 * Register the store the job hooks read.
 *
 * Jobs get a store of their own rather than the context's default one because a job id is the
 * broker's, and sharing an id space with the app's own records is how a completed job overwrites
 * an unrelated row. Idempotent, like every `append*` — an app that calls it twice keeps whatever
 * the store already collected.
 */
export const appendJobs = <C extends Config, T extends Context<C>>(
  context: T, alias: StateAlias<JobRecord> = JOBS
): T => appendStateResource<C, T, JobRecord>(context, alias) as T

/**
 * The aliases one job group answers under — the same shape `@owlmeans/server-job` declares.
 */
export const jobEntrypointAliases = (
  root: string = DEFAULT_JOB_ROOT
): JobEntrypointAliases => ({
  base: root,
  list: `${root}:list`,
  get: `${root}:get`,
  cancel: `${root}:cancel`,
  watch: `${root}:watch`,
})
