import type { Config, ScheduleDeclaration } from '@owlmeans/queue'
import { assertSchedule, schedulesOf } from '@owlmeans/queue'
import type { JobSchedulerJson, JobSchedulerTemplateOptions, Queue, RepeatOptions } from 'bullmq'
import { SCHEDULE_PREFIX } from '../consts.js'
import type { ScheduleSync } from '../types.js'
import { bullOptionsOf, mergeJobOptions } from './record.js'

/** What every run of a schedule is enqueued as. */
export interface ScheduleTemplate {
  name: string
  data: unknown
  opts: JobSchedulerTemplateOptions
}

/** The broker's scheduler id for a declared schedule. */
export const scheduleKey = (id: string): string => `${SCHEDULE_PREFIX}${id}`

/**
 * The schedule id inside a scheduler id — or `undefined` for one this driver does not own, which is
 * also what a job enqueued any other way carries as its `repeatJobKey`.
 */
export const scheduleIdOf = (key?: string | null): string | undefined =>
  key != null && key.length > SCHEDULE_PREFIX.length && key.startsWith(SCHEDULE_PREFIX)
    ? key.slice(SCHEDULE_PREFIX.length)
    : undefined

/** The timing half of a declaration, as bullmq takes it. Only what was declared is written. */
export const repeatOptionsOf = (schedule: ScheduleDeclaration): Omit<RepeatOptions, 'key'> => {
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

/**
 * The job half of a declaration: the name, the data, and the options every run is enqueued with —
 * the configured defaults, then the queue's, then the schedule's own, exactly as an ordinary
 * enqueue merges them. `id` and `delay` are dropped even when a default carries them: the broker
 * names each run and places it on the schedule.
 */
export const templateOf = <C extends Config>(
  schedule: ScheduleDeclaration, cfg?: C
): ScheduleTemplate => {
  const queue = cfg?.queue?.queues?.find(declared => declared.name === schedule.queue)
  const opts: JobSchedulerTemplateOptions = bullOptionsOf(
    mergeJobOptions(cfg?.queue?.defaults, queue?.defaults, schedule.opts)
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

/**
 * Reconcile one queue's schedulers with its declarations: create or update every declared schedule
 * the broker does not already hold as declared, and remove every scheduler under
 * {@link SCHEDULE_PREFIX} that no declaration names. Schedulers outside the prefix are never read
 * as ours and never removed.
 *
 * It never throws. Every step is caught and logged on its own, so one refused declaration or one
 * failed broker call leaves the rest applied — and a caller starting a worker is never stopped by
 * it. When the broker cannot be listed nothing is removed, since nothing can be compared.
 *
 * A queue with no declared schedules costs one listing, which is what removes the last schedule
 * once its declaration is deleted.
 */
export const syncSchedules = async <C extends Config>(
  bull: Queue, cfg: C, queue: string
): Promise<ScheduleSync> => {
  const location = `redis-queue-schedules:${queue}`
  const result: ScheduleSync = { upserted: [], unchanged: [], removed: [], failed: [] }
  const now = Date.now()

  // Keyed by id, so a later declaration of one id wins — the rule `declareSchedule` applies.
  const declared = new Map<string, ScheduleDeclaration>()
  for (const schedule of schedulesOf(cfg, queue)) {
    try {
      assertSchedule(cfg, schedule)
    } catch (error) {
      result.failed.push(String(schedule.id))
      console.error(`${location}: schedule refused`, error)
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
    console.error(`${location}: schedulers could not be listed`, error)
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
      console.error(`${location}: ${schedule.id} could not be scheduled`, error)
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
      console.error(`${location}: ${id} could not be removed`, error)
    }
  }

  return result
}
