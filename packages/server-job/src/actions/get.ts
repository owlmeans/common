import { handleParams } from '@owlmeans/server-api'
import type { AbstractResponse } from '@owlmeans/entrypoint'
import type { RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import type { JobHandlerOptions } from '../types.js'
import { jobViewer, jobsOf, readOwnedJob } from '../utils/index.js'

/**
 * One job.
 *
 * @throws {UnknownJob} for an id that is absent AND for one that belongs to someone else.
 */
export const getJob = (
  opts?: JobHandlerOptions
): RefedEntrypointHandler<AbstractResponse<any>> =>
  handleParams<{ id: string }>(async ({ id }, ctx, req) => {
    const resource = jobsOf(ctx, opts)

    return await readOwnedJob(resource, id, await jobViewer(req, ctx, opts), opts)
  })
