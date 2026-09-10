import type { ClientConfig } from '@owlmeans/client-context'
import type { ClientContext } from '@owlmeans/client'
import type { JobRecord } from '@owlmeans/queue'
import type { Criteria, Sort } from '@owlmeans/resource'
import type { StateAlias } from '@owlmeans/state'

export interface Config extends ClientConfig { }

export interface Context<C extends Config = Config> extends ClientContext<C> { }

/** The alias every entrypoint of one job group answers under. */
export interface JobEntrypointAliases {
  base: string
  list: string
  get: string
  cancel: string
  watch: string
}

export interface UseJobsOptions<D = unknown, R = unknown> {
  sort?: Sort<JobRecord<D, R>>[]
  /** Which store to read; the package's own when omitted. */
  resource?: StateAlias<JobRecord>
}

export interface JobFeedOptions {
  /** The alias root the group was declared under. */
  root?: string
  resource?: StateAlias<JobRecord>
  /** What the seeding list call asks for — `state`, `name`, `page`, `size`. */
  query?: Record<string, string | number | undefined>
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

export type JobFilter<D = unknown, R = unknown> = Criteria<JobRecord<D, R>>
