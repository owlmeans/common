import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { JobRecord, QueueResource } from '@owlmeans/queue'
import type { JobAudience } from '../../types.js'

/** The queue and the records one set of job handlers may reach, under its exposure policy. */
export interface JobPolicyHelper<A extends JobAudience = JobAudience> {
  /** The queue these handlers read: the one the options name, else the context's sole queue. */
  jobsOf: <D = unknown, R = unknown>(ctx: BasicContext<BasicConfig>) => QueueResource<D, R>
  /** Resolve an opaque id without revealing whether it exists outside the current audience. */
  readExposedJob: (resource: QueueResource, id: string, audience: A) => Promise<JobRecord>
}
