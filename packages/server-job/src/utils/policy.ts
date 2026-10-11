import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { JobRecord, QueueResource } from '@owlmeans/queue'
import { UnknownJob } from '@owlmeans/queue'
import type { Context, JobAudience, JobHandlerOptions } from '../types.js'
import type { JobPolicyHelper } from './policy/types.js'

export const makeJobPolicyHelper = <A extends JobAudience = JobAudience>(
  opts: JobHandlerOptions<A>
): JobPolicyHelper<A> => {
  const jobsOf = <D = unknown, R = unknown>(ctx: BasicContext<BasicConfig>): QueueResource<D, R> =>
    (ctx as unknown as Context).jobs<D, R>(opts.queue)

  const readExposedJob = async (resource: QueueResource, id: string, audience: A): Promise<JobRecord> => {
    const record = await opts.policy.lookup(id, audience, resource)
    if (record == null) throw new UnknownJob('job')
    return record
  }

  return { jobsOf, readExposedJob }
}
