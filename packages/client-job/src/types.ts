import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '@owlmeans/client'
import type { JobListQuery, JobView } from '@owlmeans/job'
import type { Criteria, Sort } from '@owlmeans/resource'
import type { StateAlias } from '@owlmeans/state'

export interface Config extends ClientConfig { }

export interface Context<C extends Config = Config> extends ClientContext<C> { }

export interface UseJobsOptions {
  sort?: Sort<JobView>[]
  /** Which store to read; the package's own when omitted. */
  resource?: StateAlias<JobView>
}

export interface JobFeedOptions {
  /** The alias root the group was declared under. */
  root?: string
  resource?: StateAlias<JobView>
  query?: JobListQuery
}

/**
 * Whether the feed is carrying anything yet, so a screen can tell "no jobs" from "not loaded".
 */
export interface JobFeed {
  /** The socket is open. */
  connected: boolean
  /** The authoritative list has been written into the store at least once. */
  seeded: boolean
  /** What the seeding call threw, if it threw. */
  error: Error | null
}

export type JobFilter = Criteria<JobView>
