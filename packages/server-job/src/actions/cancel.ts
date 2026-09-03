import { handleParams } from '@owlmeans/server-api'
import type { AbstractResponse } from '@owlmeans/entrypoint'
import type { RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import type { JobHandlerOptions } from '../types.js'
import { jobViewer, jobsOf, readOwnedJob } from '../utils/index.js'

/**
 * Cancel a job and answer with what was cancelled.
 *
 * Cancellation IS deletion in the queue contract — the job and its children leave the broker — so
 * a job already finished cancels to its final record and one already gone answers `UnknownJob`.
 * Nothing here interrupts a processor that is mid-run; a job holding a lock keeps it until the
 * processor notices its own `signal`.
 *
 * @throws {UnknownJob}
 */
export const cancelJob = (
  opts?: JobHandlerOptions
): RefedEntrypointHandler<AbstractResponse<any>> =>
  handleParams<{ id: string }>(async ({ id }, ctx, req) => {
    const resource = jobsOf(ctx, opts)
    // Read first: `take` cannot tell whose job it removed, so ownership is settled before it.
    await readOwnedJob(resource, id, await jobViewer(req, ctx, opts), opts)

    return await resource.take(id)
  })
