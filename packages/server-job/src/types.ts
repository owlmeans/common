import type { BasicConfig, BasicContext } from '@owlmeans/context'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { JobEntrypoints, JobListQuery, JobView } from '@owlmeans/job'
import type { JobRecord, QueueAppend, QueueConfig, QueueResource } from '@owlmeans/queue'
import type { Criteria } from '@owlmeans/resource'
import type { ApiServerAppend } from '@owlmeans/server-api'
import type { ServerConfig, ServerContext } from '@owlmeans/server-context'

export interface Config extends ServerConfig {
  queue?: QueueConfig
}

export interface Context<C extends Config = Config> extends ServerContext<C>,
  ApiServerAppend, QueueAppend { }

export type JobAudience = Record<string, unknown>

/** Required application policy at the raw-broker to public-domain boundary. */
export interface JobExposurePolicy<A extends JobAudience = JobAudience> {
  audience: (req: AbstractRequest, ctx: BasicContext<BasicConfig>) => A | Promise<A>
  /** Translate public filters and authenticated scope into broker criteria. */
  where: (audience: A, query: JobListQuery) => Criteria<JobRecord>
  /** Resolve an opaque public id within the authenticated scope. */
  lookup: (
    id: string, audience: A, resource: QueueResource
  ) => Promise<JobRecord | null>
  /** Allowlist and map a scoped broker record into its public representation. */
  map: (record: JobRecord, audience: A) => JobView | Promise<JobView>
  /** Cancellation is unavailable unless this callback is present and approves the record. */
  cancel?: (record: JobRecord, audience: A) => boolean | Promise<boolean>
}

export interface JobHandlerOptions<A extends JobAudience = JobAudience> {
  /** Which declared queue these handlers read. The context's sole queue when omitted. */
  queue?: string
  policy: JobExposurePolicy<A>
}

export type { JobEntrypoints, JobListQuery }
