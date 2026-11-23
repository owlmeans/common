import type { ScheduleProblem } from './consts.js'
import type { WorkcardDesignJob, WorkcardDesignJobSchedule } from '../types.js'

/** One cron field's bounds and the names it accepts in place of numbers. */
export interface CronField {
  min: number
  max: number
  names?: readonly string[]
  /** `?` — "no particular value", accepted where cron accepts it. */
  any?: boolean
}

/**
 * The rules of a job's schedule (`WorkcardDesignJob.schedule`) — the one place that says whether a
 * schedule the design carries can be declared on a queue. Every reader asks `scheduleOf`, which
 * answers only a valid schedule: a job whose schedule fails is a job an endpoint enqueues.
 */
export interface JobScheduleHelper {
  /** Whether a cron pattern is five valid fields — minute, hour, day of month, month, day of week. */
  isCron: (pattern: string) => boolean
  /** Whether a name is an IANA time zone the runtime knows (`Europe/London`, `UTC`). */
  isTimeZone: (tz: string) => boolean
  /** Why a schedule cannot be declared — empty when it can. */
  problemsOf: (schedule: WorkcardDesignJobSchedule) => ScheduleProblem[]
  /** The job's schedule when it carries a valid one; `null` otherwise. */
  scheduleOf: (job: Pick<WorkcardDesignJob, 'schedule'>) => WorkcardDesignJobSchedule | null
  /** Whether the broker runs this job on its own — its schedule, not an endpoint, produces it. */
  isScheduled: (job: Pick<WorkcardDesignJob, 'schedule'>) => boolean
}
