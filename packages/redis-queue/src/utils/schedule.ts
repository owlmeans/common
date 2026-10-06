import { type Config, type ScheduleDeclaration, queueConfigOf } from '@owlmeans/queue'
import { logger } from '@owlmeans/log'
import type { JobSchedulerJson, JobSchedulerTemplateOptions, Queue, RepeatOptions } from 'bullmq'
import { SCHEDULE_PREFIX } from '../consts.js'
import type { ScheduleSync } from '../types.js'
import { jobRecordHelper } from './record.js'
import type { ScheduleTemplate } from './types.js'
import type { QueueScheduleHelper } from './schedule/types.js'

const log = logger('redis-queue:schedules')

export const createQueueScheduleHelper = (): QueueScheduleHelper => {
  const scheduleKey = (id: string): string => `${SCHEDULE_PREFIX}${id}`

  const scheduleIdOf = (key?: string | null): string | undefined =>
    key != null && key.length > SCHEDULE_PREFIX.length && key.startsWith(SCHEDULE_PREFIX)
      ? key.slice(SCHEDULE_PREFIX.length)
      : undefined

  const repeatOptionsOf = (schedule: ScheduleDeclaration): Omit<RepeatOptions, 'key'> => {
    const options: Omit<RepeatOptions, 'key'> = {}

    if (schedule.every != null) options.every = schedule.every
    if (schedule.pattern != null) options.pattern = schedule.pattern
    if (schedule.tz != null) options.tz = schedule.tz
    if (schedule.startDate != null) options.startDate = schedule.startDate
    if (schedule.endDate != null) options.endDate = schedule.endDate
    if (schedule.limit != null) options.limit = schedule.limit
    if (schedule.immediately === true) options.immediately = true

    return options
  }

  const templateOf = (schedule: ScheduleDeclaration, cfg?: Config): ScheduleTemplate => {
    const queue = cfg?.queue?.queues?.find(declared => declared.name === schedule.queue)
    const opts: JobSchedulerTemplateOptions = jobRecordHelper.bullOptionsOf(
      jobRecordHelper.mergeJobOptions(cfg?.queue?.defaults, queue?.defaults, schedule.opts)
    )
    delete (opts as { jobId?: string }).jobId
    delete (opts as { delay?: number }).delay

    return { name: schedule.name, data: schedule.data ?? {}, opts }
  }

  const instantOf = (value?: Date | number | string): number | undefined =>
    value == null ? undefined : (value instanceof Date ? value : new Date(value)).getTime()

  /** JSON with object keys in a fixed order, so a stored template compares with a declared one. */
  const canonical = (value: unknown): string => {
    const ordered = (item: unknown): unknown => {
      if (Array.isArray(item)) return item.map(ordered)
      if (item == null || typeof item !== 'object' || item instanceof Date) return item
      const record = item as Record<string, unknown>

      return Object.fromEntries(Object.keys(record).sort().map(key => [key, ordered(record[key])]))
    }

    return JSON.stringify(ordered(value)) ?? ''
  }

  /**
   * Whether the broker already holds this schedule as declared.
   *
   * Upserting an unchanged scheduler is not free of consequences: it replaces the pending run, runs a
   * pattern with `immediately` again, and collides with a run that is in progress. Comparing first is
   * what makes a restart leave a schedule alone. `immediately` is not stored by the broker and so
   * cannot differ; anything else that differs makes this false, and the worst a false negative costs
   * is one upsert.
   */
  const heldAsDeclared = (
    stored: JobSchedulerJson, schedule: ScheduleDeclaration, template: ScheduleTemplate
  ): boolean =>
    stored.name === template.name
    && stored.every === schedule.every
    && (stored.pattern ?? undefined) === schedule.pattern
    && (stored.tz ?? undefined) === schedule.tz
    && stored.limit === schedule.limit
    && stored.startDate === instantOf(schedule.startDate)
    && stored.endDate === instantOf(schedule.endDate)
    && canonical(stored.template?.data ?? {}) === canonical(template.data)
    && canonical(stored.template?.opts ?? {}) === canonical(template.opts)

  const syncSchedules = async (bull: Queue, cfg: Config, queue: string): Promise<ScheduleSync> => {
    const result: ScheduleSync = { upserted: [], unchanged: [], removed: [], failed: [] }
    const now = Date.now()
    const queueConfig = queueConfigOf(cfg)

    // Keyed by id, so a later declaration of one id wins — the rule `declareSchedule` applies.
    const declared = new Map<string, ScheduleDeclaration>()
    for (const schedule of queueConfig.schedulesOf(queue)) {
      try {
        queueConfig.assertSchedule(schedule)
      } catch (error) {
        result.failed.push(String(schedule.id))
        log.error('Schedule refused', { queue, schedule: String(schedule.id), error })
        continue
      }
      // A schedule past its end is treated as absent, so a scheduler left from it is removed below.
      const ends = instantOf(schedule.endDate)
      if (ends != null && ends <= now) {
        declared.delete(schedule.id)
        continue
      }
      declared.set(schedule.id, schedule)
    }

    let stored: Map<string, JobSchedulerJson> | null = null
    try {
      const schedulers = await bull.getJobSchedulers(0, -1)
      stored = new Map(
        // A scheduler whose metadata is gone lists as nothing at all; it is not ours to reason about.
        schedulers.filter(scheduler => scheduler != null && scheduleIdOf(scheduler.key) != null)
          .map(scheduler => [scheduler.key, scheduler])
      )
    } catch (error) {
      log.error('Schedulers could not be listed', { queue, error })
    }

    for (const schedule of declared.values()) {
      try {
        const template = templateOf(schedule, cfg)
        const held = stored?.get(scheduleKey(schedule.id))
        if (held != null && heldAsDeclared(held, schedule, template)) {
          result.unchanged.push(schedule.id)
          continue
        }

        await bull.upsertJobScheduler(scheduleKey(schedule.id), repeatOptionsOf(schedule), template)
        result.upserted.push(schedule.id)
      } catch (error) {
        result.failed.push(schedule.id)
        log.error('Schedule could not be upserted', { queue, schedule: schedule.id, error })
      }
    }

    for (const key of stored?.keys() ?? []) {
      const id = scheduleIdOf(key) as string
      if (declared.has(id)) {
        continue
      }
      try {
        if (await bull.removeJobScheduler(key)) {
          result.removed.push(id)
        }
      } catch (error) {
        log.error('Schedule could not be removed', { queue, schedule: id, error })
      }
    }

    return result
  }

  return { scheduleKey, scheduleIdOf, repeatOptionsOf, templateOf, syncSchedules }
}

export const queueScheduleHelper = createQueueScheduleHelper()

/** @deprecated compat:factory-refactor — use `queueScheduleHelper.scheduleKey(…)` */
export const scheduleKey = (id: string): string => queueScheduleHelper.scheduleKey(id)
