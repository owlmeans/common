import { memoHelper } from '@owlmeans/context'
import type { Config, JobOptions, QueueDeclaration, ScheduleDeclaration } from './types.js'
import type { QueueConfigHelper } from './queue-config/types.js'
import { ScheduleMisdeclared, UnknownJobName, UnknownQueue } from './errors.js'

/**
 * The queue configuration of one `cfg`. It reads `cfg.queue` on every call, so declarations made
 * after it was built are seen.
 */
export const makeQueueConfigHelper = (cfg: Config): QueueConfigHelper => {
  const queueOf = (name: string): QueueDeclaration => {
    const queue = cfg.queue?.queues?.find(declared => declared.name === name)

    if (queue == null) {
      throw new UnknownQueue(name)
    }

    return queue
  }

  const queueOfJob = (job: string): QueueDeclaration | undefined =>
    cfg.queue?.queues?.find(declared => declared.jobs.includes(job))

  const isListening = (name: string): boolean =>
    cfg.queue?.listen?.includes(name) === true

  /** A date option the broker can read — a `Date`, epoch milliseconds or a parsable string. */
  const isInstant = (value: Date | number | string): boolean =>
    Number.isFinite((value instanceof Date ? value : new Date(value)).getTime())

  const assertSchedule = (schedule: ScheduleDeclaration): void => {
    const { id } = schedule
    if (typeof id !== 'string' || id.trim() === '') {
      throw new ScheduleMisdeclared('(empty):id')
    }

    const queue = queueOf(schedule.queue)
    if (!queue.jobs.includes(schedule.name)) {
      throw new UnknownJobName(`${schedule.queue}:${schedule.name}`)
    }

    const every = schedule.every != null
    const pattern = schedule.pattern != null
    if (every === pattern) {
      throw new ScheduleMisdeclared(`${id}:every-or-pattern`)
    }
    if (every && !(Number.isSafeInteger(schedule.every) && (schedule.every as number) > 0)) {
      throw new ScheduleMisdeclared(`${id}:every`)
    }
    if (pattern && (typeof schedule.pattern !== 'string' || schedule.pattern.trim() === '')) {
      throw new ScheduleMisdeclared(`${id}:pattern`)
    }
    // Both only mean something to a cron pattern: an interval has no wall clock to read in a time
    // zone, and its first run is immediate already.
    if (!pattern && schedule.tz != null) {
      throw new ScheduleMisdeclared(`${id}:tz`)
    }
    if (!pattern && schedule.immediately === true) {
      throw new ScheduleMisdeclared(`${id}:immediately`)
    }
    if (schedule.immediately === true && schedule.startDate != null) {
      throw new ScheduleMisdeclared(`${id}:immediately-start-date`)
    }
    if (schedule.limit != null && !(Number.isSafeInteger(schedule.limit) && schedule.limit > 0)) {
      throw new ScheduleMisdeclared(`${id}:limit`)
    }
    if (schedule.startDate != null && !isInstant(schedule.startDate)) {
      throw new ScheduleMisdeclared(`${id}:start-date`)
    }
    if (schedule.endDate != null && !isInstant(schedule.endDate)) {
      throw new ScheduleMisdeclared(`${id}:end-date`)
    }

    // The type already omits both; a declaration assembled at runtime still reaches this check. The
    // broker names every run itself and places it on the schedule, so either would be overridden.
    const opts = schedule.opts as JobOptions | undefined
    if (opts?.id != null) {
      throw new ScheduleMisdeclared(`${id}:opts-id`)
    }
    if (opts?.delay != null) {
      throw new ScheduleMisdeclared(`${id}:opts-delay`)
    }
  }

  const schedulesOf = (queue?: string): ScheduleDeclaration[] =>
    (cfg.queue?.schedules ?? []).filter(schedule => queue == null || schedule.queue === queue)

  const assertSchedules = (): void => {
    const seen = new Set<string>()
    for (const schedule of schedulesOf()) {
      assertSchedule(schedule)
      if (seen.has(schedule.id)) {
        throw new ScheduleMisdeclared(`${schedule.id}:duplicate`)
      }
      seen.add(schedule.id)
    }
  }

  return { queueOf, queueOfJob, isListening, assertSchedule, schedulesOf, assertSchedules }
}

export const queueConfigOf = memoHelper.oncePer(makeQueueConfigHelper)
