import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod, socket } from '@owlmeans/route'
import type { RouteOptions } from '@owlmeans/route'
import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { DEFAULT_JOB_PATH } from './consts.js'
import { JobListQuerySchema } from './schemas.js'
import type { JobEntrypointAliases, JobEntrypoints, JobEntrypointOptions, JobListQuery } from './types.js'

/**
 * The aliases one job group answers under.
 *
 * The shape — `<root>` and `<root>:<verb>` — is the contract `@owlmeans/client-job` addresses the
 * same group by, so a group renamed here is renamed there by passing the same root.
 */
export const jobEntrypointAliases = (root: string): JobEntrypointAliases => ({
  base: root,
  list: `${root}:list`,
  get: `${root}:get`,
  cancel: `${root}:cancel`,
  watch: `${root}:watch`,
})

/**
 * Declare the list/get/cancel/watch entrypoints of one job group.
 *
 * It belongs in the SHARED package of a target app — the one both the API and the browser import —
 * so that the server elevates and the client calls the very declarations, and neither side ever
 * writes a path. Declaring a second group is the same call with another root.
 *
 * The guard rides on the base alone: guards are inherited, so stating it once is what keeps the
 * four from drifting apart.
 */
export const declareJobEntrypoints = (
  root: string, opts?: JobEntrypointOptions
): JobEntrypoints => {
  const aliases = jobEntrypointAliases(root)
  const base: Partial<RouteOptions> = {
    ...(opts?.parent != null ? { parent: opts.parent } : {}),
    ...(opts?.service != null ? { service: opts.service } : {}),
  }
  const guarded = opts?.guard === null ? undefined : { guards: opts?.guard ?? DEFAULT_GUARD }

  return {
    base: openProtocol(route(aliases.base, opts?.path ?? DEFAULT_JOB_PATH, backend(base)), guarded),
    list: protocol(
      route(aliases.list, '/', backend(aliases.base)),
      contract.request({ query: typed<JobListQuery>(JobListQuerySchema) }, typed())
    ),
    // Static before parametric, so `/watch` is not swallowed by `/:id`. The router picks the
    // static branch on its own; the order here is for whoever reads the declaration.
    watch: protocol(route(aliases.watch, '/watch', socket(aliases.base)), contract(typed<void>())),
    get: protocol(
      route(aliases.get, '/:id', backend(aliases.base)),
      contract.request({ params: typed<{ id: string }>() }, typed())
    ),
    cancel: protocol(
      route(aliases.cancel, '/:id', backend(aliases.base, RouteMethod.DELETE)),
      contract.request({ params: typed<{ id: string }>() }, typed())
    ),
  }
}
