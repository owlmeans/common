import type {
  Config, JobOptions, QueueDeclaration, QueueWorkerOptions, ScheduleDeclaration
} from './types.js'
import { ScheduleMisdeclared, UnknownJobName, UnknownQueue } from './errors.js'

/**
 * Add a queue to the shared configuration. Every process in the monorepo loads the same
 * declarations — a producer needs them to know a queue exists and what it accepts, a worker needs
 * them to bind. Declaring twice replaces, so a helper that runs per app is safe to call.
 */
export const declareQueue = <C extends Config>(
  cfg: C, name: string, jobs: string[], opts?: { worker?: QueueWorkerOptions, defaults?: JobOptions }
): C => {
  const queue: QueueDeclaration = { name, jobs, ...opts }
  const queues = cfg.queue?.queues ?? []
  const existing = queues.findIndex(declared => declared.name === name)

  if (existing < 0) {
    queues.push(queue)
  } else {
    queues[existing] = queue
  }

  cfg.queue = { ...cfg.queue, queues }

  return cfg
}

/**
 * Name the queues this process consumes. It is what turns an otherwise identical binary into a
 * worker, which is why it lives in the process's own config and never in a declaration.
 */
export const listenQueues = <C extends Config>(cfg: C, ...names: string[]): C => {
  const listen = new Set([...(cfg.queue?.listen ?? []), ...names])

  cfg.queue = { ...cfg.queue, listen: [...listen] }

  return cfg
}

/**
 * @throws {UnknownQueue}
 */
export const queueOf = <C extends Config>(cfg: C, name: string): QueueDeclaration => {
  const queue = cfg.queue?.queues?.find(declared => declared.name === name)

  if (queue == null) {
    throw new UnknownQueue(name)
  }

  return queue
}

export const queueOfJob = <C extends Config>(cfg: C, job: string): QueueDeclaration | undefined =>
  cfg.queue?.queues?.find(declared => declared.jobs.includes(job))

export const isListening = <C extends Config>(cfg: C, name: string): boolean =>
  cfg.queue?.listen?.includes(name) === true

/** A date option the broker can read — a `Date`, epoch milliseconds or a parsable string. */
const isInstant = (value: Date | number | string): boolean =>
  Number.isFinite((value instanceof Date ? value : new Date(value)).getTime())

/**
 * Whether the broker can carry a schedule out as written. Nothing is recorded or changed.
 *
 * @throws {ScheduleMisdeclared} naming the schedule id and the reason.
 * @throws {UnknownQueue} when the schedule's queue is not declared.
 * @throws {UnknownJobName} when that queue does not accept the schedule's job name — a scheduled
 * run of a name nothing declares would fail on every tick instead of once, at declaration.
 */
export const assertSchedule = <C extends Config>(cfg: C, schedule: ScheduleDeclaration): void => {
  const { id } = schedule
  if (typeof id !== 'string' || id.trim() === '') {
    throw new ScheduleMisdeclared('(empty):id')
  }

  const queue = queueOf(cfg, schedule.queue)
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

/**
 * Add a recurring job to the shared configuration. Declare the queue first — a schedule is checked
 * against it here. Declaring an id twice replaces, like `declareQueue`.
 *
 * Declaring is all this does: the driver creates, updates and removes the broker's schedulers when
 * a worker that listens to the queue starts.
 *
 * @throws {ScheduleMisdeclared} / {UnknownQueue} / {UnknownJobName} — see `assertSchedule`.
 */
export const declareSchedule = <C extends Config>(cfg: C, schedule: ScheduleDeclaration): C => {
  assertSchedule(cfg, schedule)

  const schedules = cfg.queue?.schedules ?? []
  const existing = schedules.findIndex(declared => declared.id === schedule.id)

  if (existing < 0) {
    schedules.push(schedule)
  } else {
    schedules[existing] = schedule
  }

  cfg.queue = { ...cfg.queue, schedules }

  return cfg
}

/** The declared schedules, of one queue when it is named. */
export const schedulesOf = <C extends Config>(cfg: C, queue?: string): ScheduleDeclaration[] =>
  (cfg.queue?.schedules ?? []).filter(schedule => queue == null || schedule.queue === queue)

/**
 * Check every declared schedule, including any written into the configuration without
 * `declareSchedule`, and refuse two under one id.
 *
 * @throws {ScheduleMisdeclared} / {UnknownQueue} / {UnknownJobName} for the first one that fails.
 */
export const assertSchedules = <C extends Config>(cfg: C): void => {
  const seen = new Set<string>()
  for (const schedule of schedulesOf(cfg)) {
    assertSchedule(cfg, schedule)
    if (seen.has(schedule.id)) {
      throw new ScheduleMisdeclared(`${schedule.id}:duplicate`)
    }
    seen.add(schedule.id)
  }
}
