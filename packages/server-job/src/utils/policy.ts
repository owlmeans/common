import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { JobRecord, QueueResource } from '@owlmeans/queue'
import { UnknownJob } from '@owlmeans/queue'
import type { Context, JobAudience, JobHandlerOptions } from '../types.js'

export const jobsOf = <D = unknown, R = unknown>(
  ctx: BasicContext<BasicConfig>, opts: JobHandlerOptions
): QueueResource<D, R> => (ctx as unknown as Context).jobs<D, R>(opts.queue)

/** Resolve an opaque id without revealing whether it exists outside the current audience. */
export const readExposedJob = async <A extends JobAudience>(
  resource: QueueResource,
  id: string,
  audience: A,
  opts: JobHandlerOptions<A>,
): Promise<JobRecord> => {
  const record = await opts.policy.lookup(id, audience, resource)
  if (record == null) throw new UnknownJob('job')
  return record
}
