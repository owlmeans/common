import { useStoreList, useStoreModel } from '@owlmeans/client'
import type { StateModel } from '@owlmeans/state'
import type { JobRecord } from '@owlmeans/queue'
import { JOBS } from './consts.js'
import type { JobFilter, UseJobsOptions } from './types.js'

/**
 * One job, live.
 *
 * Never throws for an id the store has not seen — the model comes back `empty`, which is what a
 * screen renders as "still loading" while {@link useJobFeed} seeds.
 */
export const useJob = <D = unknown, R = unknown>(
  id?: string, resource: string = JOBS
): StateModel<JobRecord<D, R>> => useStoreModel<JobRecord<D, R>>(id, resource)

/**
 * A live query over the job store, newest first unless told otherwise.
 *
 * The criteria is the resource language, so a filter written for the list entrypoint means the
 * same thing here: `{ state: JobState.Active }`, `{ name: 'report:build' }`, `{ 'data.target': id }`.
 */
export const useJobs = <D = unknown, R = unknown>(
  filter?: JobFilter<D, R>, opts?: UseJobsOptions<D, R>
): StateModel<JobRecord<D, R>>[] => useStoreList<JobRecord<D, R>>({
  query: filter,
  sort: opts?.sort ?? [{ field: 'createdAt', order: 'desc' }],
  resource: opts?.resource ?? JOBS,
})
