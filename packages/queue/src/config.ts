import type { Config, JobOptions, QueueDeclaration, QueueWorkerOptions } from './types.js'
import { UnknownQueue } from './errors.js'

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
