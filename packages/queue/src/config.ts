import type {
  Config, JobOptions, QueueDeclaration, QueueWorkerOptions, ScheduleDeclaration
} from './types.js'
import { queueConfigOf } from './queue-config.js'

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
 * Add a recurring job to the shared configuration. Declare the queue first — a schedule is checked
 * against it here. Declaring an id twice replaces, like `declareQueue`.
 *
 * Declaring is all this does: the driver creates, updates and removes the broker's schedulers when
 * a worker that listens to the queue starts.
 *
 * @throws {ScheduleMisdeclared} / {UnknownQueue} / {UnknownJobName} — see `assertSchedule`.
 */
export const declareSchedule = <C extends Config>(cfg: C, schedule: ScheduleDeclaration): C => {
  queueConfigOf(cfg).assertSchedule(schedule)

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

/** @deprecated compat:factory-refactor — use `queueConfigOf(cfg).queueOfJob(…)` */
export const queueOfJob = <C extends Config>(cfg: C, job: string): QueueDeclaration | undefined =>
  queueConfigOf(cfg).queueOfJob(job)

/** @deprecated compat:factory-refactor — use `queueConfigOf(cfg).isListening(…)` */
export const isListening = <C extends Config>(cfg: C, name: string): boolean =>
  queueConfigOf(cfg).isListening(name)

/** @deprecated compat:factory-refactor — use `queueConfigOf(cfg).schedulesOf(…)` */
export const schedulesOf = <C extends Config>(cfg: C, queue?: string): ScheduleDeclaration[] =>
  queueConfigOf(cfg).schedulesOf(queue)

/** @deprecated compat:factory-refactor — use `queueConfigOf(cfg).assertSchedules()` */
export const assertSchedules = <C extends Config>(cfg: C): void => queueConfigOf(cfg).assertSchedules()
