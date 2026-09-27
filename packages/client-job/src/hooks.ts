import { useStoreList, useStoreModel } from '@owlmeans/client'
import type { StateModel } from '@owlmeans/state'
import type { JobView } from '@owlmeans/job'
import { JOBS } from './consts.js'
import type { JobFilter, UseJobsOptions } from './types.js'

/**
 * One job, live.
 *
 * Never throws for an id the store has not seen — the model comes back `empty`, which is what a
 * screen renders as "still loading" while {@link useJobFeed} seeds.
 */
export const useJob = (
  id?: string, resource: string = JOBS
): StateModel<JobView> => useStoreModel<JobView>(id, resource)

/**
 * A live query over the job store, newest first unless told otherwise.
 *
 * The criteria is the resource language, so a filter written for the list entrypoint means the
 * same thing here: `{ status: JobViewStatus.Running }`, `{ kind: 'report-build' }` or an
 * allowlisted metadata field.
 */
export const useJobs = (
  filter?: JobFilter, opts?: UseJobsOptions
): StateModel<JobView>[] => useStoreList<JobView>({
  query: filter,
  sort: opts?.sort ?? [{ field: 'createdAt', order: 'desc' }],
  resource: opts?.resource ?? JOBS,
})
