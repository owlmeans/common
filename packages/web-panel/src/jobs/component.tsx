import type { FC } from 'react'
import { useMemo } from 'react'
import { JobState } from '@owlmeans/queue'
import type { JobRecord } from '@owlmeans/queue'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import type { JobProps, JobStatusProps } from './types.js'

/**
 * A job's progress as a percentage, or `undefined` when there is nothing to show yet.
 *
 * `JobRecord.progress` is deliberately `unknown` — a processor reports whatever it counts — so the
 * three shapes worth understanding are read here and everything else falls through to the
 * indeterminate bar, which is the honest answer for "running, no idea how far".
 */
export const jobProgressValue = (job: JobRecord): number | undefined => {
  if (job.state === JobState.Completed) {
    return 100
  }
  const progress = job.progress
  const value = typeof progress === 'number' ? progress
    : typeof progress === 'object' && progress != null
      ? percentOf(progress as Record<string, unknown>)
      : undefined

  return value == null ? undefined : Math.max(0, Math.min(100, value))
}

const percentOf = (progress: Record<string, unknown>): number | undefined => {
  if (typeof progress.percent === 'number') {
    return progress.percent
  }
  const { done, total } = progress
  if (typeof done === 'number' && typeof total === 'number' && total > 0) {
    return (done / total) * 100
  }

  return undefined
}

/**
 * The bar for one job. A job with nothing to report animates indeterminately rather than sitting
 * at zero, because zero and "the processor never called `progress()`" look identical otherwise.
 */
export const JobProgress: FC<JobProps> = ({ job, className, style }) => {
  const value = useMemo(() => jobProgressValue(job), [job.state, job.progress])

  return <Progress
    data-slot="job-progress"
    value={value}
    className={cn('w-full', className)}
    style={style}
  />
}

const STATE_STYLE: Record<JobState, string> = {
  [JobState.Waiting]: 'border-border bg-muted text-muted-foreground',
  [JobState.Delayed]: 'border-border bg-muted text-muted-foreground',
  [JobState.Active]: 'border-border bg-accent text-accent-foreground',
  [JobState.Completed]: 'border-primary/40 bg-primary/10 text-primary',
  [JobState.Failed]: 'border-destructive/40 bg-destructive/10 text-destructive',
  [JobState.Unknown]: 'border-border bg-muted text-muted-foreground',
}

/** The state pill. `data-state` carries the raw state, so a test never keys on the wording. */
export const JobStatus: FC<JobStatusProps> = ({ job, labels, className, style }) => {
  const state = job.state ?? JobState.Unknown

  return <span
    data-slot="job-status"
    data-state={state}
    className={cn(
      'inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium',
      STATE_STYLE[state], className
    )}
    style={style}
  >{labels?.[state] ?? state}</span>
}
