import { bind } from '@owlmeans/server-entrypoint'
import { cancelJob, getJob, listJobs, watchJobs } from './actions/index.js'
import type { JobEntrypoints, JobHandlerOptions } from './types.js'

/**
 * Attach this package's handlers to a group declared by {@link declareJobEntrypoints}.
 *
 * The whole server half of "a long job reports progress to the user's screen" is this call plus
 * the queue driver an app already wires — nothing is subclassed, and an app that wants one
 * handler of its own elevates that alias itself afterwards, since `elevate` replaces in place.
 *
 * @throws {SyntaxError} when the array carries no group under that root.
 */
export const serveJobEntrypoints = (entrypoints: JobEntrypoints, opts?: JobHandlerOptions) => [
  bind(entrypoints.base),
  bind(entrypoints.list, listJobs(entrypoints.list, opts)),
  bind(entrypoints.watch, watchJobs(entrypoints.watch, opts)),
  bind(entrypoints.get, getJob(entrypoints.get, opts)),
  bind(entrypoints.cancel, cancelJob(entrypoints.cancel, opts)),
]
