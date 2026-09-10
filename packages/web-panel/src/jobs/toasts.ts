import { useEffect, useRef } from 'react'
import { toast } from 'sonner'
import { isSettled, JobState } from '@owlmeans/queue'
import type { JobRecord } from '@owlmeans/queue'
import type { JobToastOptions } from './types.js'

/**
 * Announce jobs as they finish, on the `Toaster` the layout already mounts.
 *
 * Hand it whatever the screen is already showing — `useJobs()` from `@owlmeans/client-job` maps
 * straight onto it — and it raises one toast per job the first time that job settles.
 *
 * **The first pass never toasts.** A screen opening onto a store seeded with yesterday's finished
 * jobs would otherwise fire a stack of them at once, so everything already settled when this
 * mounts is recorded as announced and only what settles afterwards is reported.
 */
export const useJobToasts = (jobs: JobRecord[], opts?: JobToastOptions): void => {
  const announced = useRef<Set<string>>(new Set())
  const primed = useRef(false)
  // Re-run on what actually decides a toast, not on the array identity a caller rebuilds per render.
  const settlement = jobs.map(job => `${job.id}:${job.state}`).join(',')

  useEffect(() => {
    jobs.forEach(job => {
      if (job.id == null || !isSettled(job.state) || announced.current.has(job.id)) {
        return
      }
      announced.current.add(job.id)
      if (!primed.current) {
        return
      }
      const message = opts?.message?.(job) ?? job.name
      if (job.state === JobState.Completed) {
        toast.success(message)
      } else {
        toast.error(job.error != null && job.error !== '' ? `${String(message)}: ${job.error}` : message)
      }
    })
    primed.current = true
  }, [settlement])
}
