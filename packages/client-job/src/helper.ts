import { appendStateResource } from '@owlmeans/state'
import type { StateAlias } from '@owlmeans/state'
import type { JobView } from '@owlmeans/job'
import { JOBS } from './consts.js'
import type { Config, Context } from './types.js'

/**
 * Register the store the job hooks read.
 *
 * Jobs get a store of their own rather than the context's default one because their opaque ids
 * are a separate domain namespace. Sharing that id space with the app's own records is how a
 * completed operation overwrites an unrelated row. Idempotent, like every `append*` — an app that
 * calls it twice keeps whatever the store already collected.
 */
export const appendJobs = <C extends Config, T extends Context<C>>(
  context: T, alias: StateAlias<JobView> = JOBS
): T => appendStateResource<C, T, JobView>(context, alias) as T
