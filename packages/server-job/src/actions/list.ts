import { handlers } from '@owlmeans/server-api'
import type { Criteria } from '@owlmeans/resource'
import type { JobRecord } from '@owlmeans/queue'
import type { JobState } from '@owlmeans/queue'
import { DEFAULT_JOB_SORT } from '../consts.js'
import type { Context, JobEntrypoints, JobHandlerOptions, JobListQuery } from '../types.js'
import { jobScope, jobViewer, jobsOf } from '../utils/index.js'

/**
 * The caller's jobs, newest first.
 *
 * Paging is opt-in: a `page` without a `size` is refused by the queue resource rather than
 * silently windowed, because a broker has no default page size to count against. The state and
 * name filters go through the same criteria language as every other resource, so a filter written
 * for this list means the same thing applied to the store the browser holds.
 */
export const listJobs = (
  protocol: JobEntrypoints['list'],
  opts?: JobHandlerOptions
): ReturnType<ReturnType<typeof handlers<Context>>['request']> => handlers<Context>().request(protocol, async (req, ctx) => {
  const resource = jobsOf(ctx, opts)
  const viewer = await jobViewer(req, ctx, opts)
  const query = (req.query ?? {}) as JobListQuery

  const where: Criteria<JobRecord> = {
    ...jobScope(viewer, opts),
    ...(query.state != null ? { state: query.state as JobState } : {}),
    ...(query.name != null ? { name: query.name } : {}),
  }

  return await resource.list(where, {
    sort: [{ field: DEFAULT_JOB_SORT, order: 'desc' }],
    ...(query.size != null ? { size: query.size, page: query.page ?? 0 } : {}),
  })
})
