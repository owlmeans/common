import { handlers } from '@owlmeans/server-api'
import type { JobView } from '@owlmeans/job'
import type { ListResult } from '@owlmeans/resource'
import type { Context, JobEntrypoints, JobHandlerOptions, JobListQuery } from '../types.js'
import { jobsOf } from '../utils/index.js'

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
  opts: JobHandlerOptions
): ReturnType<ReturnType<typeof handlers<Context>>['request']> => handlers<Context>().request(protocol, async (req, ctx) => {
  const resource = jobsOf(ctx, opts)
  const audience = await opts.policy.audience(req, ctx)
  const query = (req.query ?? {}) as JobListQuery
  const listed = await resource.list(opts.policy.where(audience, query), {
    sort: [{ field: 'createdAt', order: 'desc' }],
    ...(query.size != null ? { size: query.size, page: query.page ?? 0 } : {}),
  })
  return {
    ...listed,
    items: await Promise.all(listed.items.map(record => opts.policy.map(record, audience))),
  } satisfies ListResult<JobView>
})
