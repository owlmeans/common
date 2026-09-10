import type { Config, JobOptions } from '@owlmeans/queue'
import { queueOf, UnknownJobName } from '@owlmeans/queue'
import { mergeJobOptions } from './record.js'

export interface DeclaredJob {
  name: string
  opts: JobOptions
}

/**
 * What a job of this name enqueues with — and whether it may be enqueued at all.
 *
 * A queue declares the job names it accepts, so a name nothing declared is refused here rather
 * than becoming a job that sits in redis until someone wonders why it never ran.
 *
 * @throws {UnknownQueue} when the queue is not declared.
 * @throws {UnknownJobName} when the queue does not accept this job name.
 */
export const declaredJob = <C extends Config>(
  cfg: C, queue: string, name?: string, opts?: JobOptions
): DeclaredJob => {
  const declaration = queueOf(cfg, queue)

  if (name == null || !declaration.jobs.includes(name)) {
    throw new UnknownJobName(`${queue}:${name ?? '(unnamed)'}`)
  }

  return { name, opts: mergeJobOptions(cfg.queue?.defaults, declaration.defaults, opts) }
}
