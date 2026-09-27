import { DEFAULT_GUARD } from '@owlmeans/auth-common'
import { contract, openProtocol, protocol, typed } from '@owlmeans/entrypoint'
import { backend, route, RouteMethod, socket } from '@owlmeans/route'
import type { RouteOptions } from '@owlmeans/route'
import { DEFAULT_JOB_PATH, DEFAULT_JOB_ROOT } from './consts.js'
import { JobListQuerySchema, JobViewListSchema, JobViewSchema } from './schemas.js'
import type {
  JobEntrypointAliases, JobEntrypointOptions, JobEntrypoints, JobListQuery, JobView,
} from './types.js'
import type { ListResult } from '@owlmeans/resource'

export const jobEntrypointAliases = (root: string = DEFAULT_JOB_ROOT): JobEntrypointAliases => ({
  base: root,
  list: `${root}:list`,
  get: `${root}:get`,
  cancel: `${root}:cancel`,
  watch: `${root}:watch`,
})

/** Declare the sanitized job projection surface shared by an API and its client. */
export const declareJobEntrypoints = (
  root: string = DEFAULT_JOB_ROOT, opts?: JobEntrypointOptions
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
      route(aliases.list, '/', backend({ parent: aliases.base })),
      contract.request(
        { query: typed<JobListQuery>(JobListQuerySchema) },
        typed<ListResult<JobView>>(JobViewListSchema)
      )
    ),
    watch: protocol(
      route(aliases.watch, '/watch', socket({ parent: aliases.base })),
      contract(typed<void>())
    ),
    get: protocol(
      route(aliases.get, '/:id', backend({ parent: aliases.base })),
      contract.request({ params: typed<{ id: string }>() }, typed<JobView>(JobViewSchema))
    ),
    cancel: protocol(
      route(aliases.cancel, '/:id', backend({ parent: aliases.base, method: RouteMethod.DELETE })),
      contract.request({ params: typed<{ id: string }>() }, typed<JobView>(JobViewSchema))
    ),
  }
}
