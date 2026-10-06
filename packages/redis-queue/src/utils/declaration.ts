import { type Config, type JobOptions, queueConfigOf, UnknownJobName } from '@owlmeans/queue'
import { jobRecordHelper } from './record.js'
import type { DeclaredJob } from './types.js'

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
  const declaration = queueConfigOf(cfg).queueOf(queue)

  if (name == null || !declaration.jobs.includes(name)) {
    throw new UnknownJobName(`${queue}:${name ?? '(unnamed)'}`)
  }

  return { name, opts: jobRecordHelper.mergeJobOptions(cfg.queue?.defaults, declaration.defaults, opts) }
}
