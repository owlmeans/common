import { handlers } from '@owlmeans/server-api'
import type { Context, JobEntrypoints, JobHandlerOptions } from '../types.js'
import { jobViewer, jobsOf, readOwnedJob } from '../utils/index.js'

/**
 * One job.
 *
 * @throws {UnknownJob} for an id that is absent AND for one that belongs to someone else.
 */
export const getJob = (
  protocol: JobEntrypoints['get'],
  opts?: JobHandlerOptions
): ReturnType<ReturnType<typeof handlers<Context>>['params']> =>
  handlers<Context>().params(protocol, async ({ id }, ctx, req) => {
    const resource = jobsOf(ctx, opts)

    return await readOwnedJob(resource, id, await jobViewer(req, ctx, opts), opts)
  })
