import type { Config, ScheduleDeclaration } from '@owlmeans/queue'
import type { Queue, RepeatOptions } from 'bullmq'
import type { ScheduleSync } from '../../types.js'
import type { ScheduleTemplate } from '../types.js'

/** Declared schedules as the broker's job schedulers, and the reconciling of the two. */
export interface QueueScheduleHelper {
  /** The broker's scheduler id for a declared schedule. */
  scheduleKey: (id: string) => string
  /**
   * The schedule id inside a scheduler id — or `undefined` for one this driver does not own, which is
   * also what a job enqueued any other way carries as its `repeatJobKey`.
   */
  scheduleIdOf: (key?: string | null) => string | undefined
  /** The timing half of a declaration, as bullmq takes it. Only what was declared is written. */
  repeatOptionsOf: (schedule: ScheduleDeclaration) => Omit<RepeatOptions, 'key'>
  /**
   * The job half of a declaration: the name, the data, and the options every run is enqueued with —
   * the configured defaults, then the queue's, then the schedule's own, exactly as an ordinary
   * enqueue merges them. `id` and `delay` are dropped even when a default carries them: the broker
   * names each run and places it on the schedule.
   */
  templateOf: (schedule: ScheduleDeclaration, cfg?: Config) => ScheduleTemplate
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
  syncSchedules: (bull: Queue, cfg: Config, queue: string) => Promise<ScheduleSync>
}
