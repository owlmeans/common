import { elevate } from '@owlmeans/server-entrypoint'
import type { ServerEntrypoint } from '@owlmeans/server-entrypoint'
import type { CommonEntrypoint } from '@owlmeans/entrypoint'
import { jobEntrypointAliases } from './entrypoints.js'
import { cancelJob, getJob, listJobs, watchJobs } from './actions/index.js'
import type { JobHandlerOptions } from './types.js'

/**
 * Attach this package's handlers to a group declared by {@link declareJobEntrypoints}.
 *
 * The whole server half of "a long job reports progress to the user's screen" is this call plus
 * the queue driver an app already wires — nothing is subclassed, and an app that wants one
 * handler of its own elevates that alias itself afterwards, since `elevate` replaces in place.
 *
 * @throws {SyntaxError} when the array carries no group under that root.
 */
export const serveJobEntrypoints = <R>(
  entrypoints: (CommonEntrypoint | ServerEntrypoint<R>)[], root: string, opts?: JobHandlerOptions
): ServerEntrypoint<R>[] => {
  const aliases = jobEntrypointAliases(root)

  elevate(entrypoints, aliases.base)
  elevate(entrypoints, aliases.list, listJobs(opts))
  elevate(entrypoints, aliases.watch, watchJobs(opts))
  elevate(entrypoints, aliases.get, getJob(opts))

  return elevate(entrypoints, aliases.cancel, cancelJob(opts))
}
