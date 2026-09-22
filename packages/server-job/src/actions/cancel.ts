import { handlers } from '@owlmeans/server-api'
import { UnknownJob } from '@owlmeans/queue'
import type { Context, JobEntrypoints, JobHandlerOptions } from '../types.js'
import { jobsOf, readExposedJob } from '../utils/index.js'

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
  protocol: JobEntrypoints['cancel'],
  opts: JobHandlerOptions
): ReturnType<ReturnType<typeof handlers<Context>>['params']> =>
  handlers<Context>().params(protocol, async ({ id }, ctx, req) => {
    const resource = jobsOf(ctx, opts)
    const audience = await opts.policy.audience(req, ctx)
    const record = await readExposedJob(resource, id, audience, opts)
    if (opts.policy.cancel == null || !await opts.policy.cancel(record, audience)) {
      throw new UnknownJob('job')
    }
    const removed = await resource.take(record.id as string)
    return await opts.policy.map(removed, audience)
  })
