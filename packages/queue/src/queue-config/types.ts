import type { QueueDeclaration, ScheduleDeclaration } from '../types.js'

/** What one configuration declares about its queues and schedules, read and checked. */
export interface QueueConfigHelper {
  /**
   * @throws {UnknownQueue}
   */
  queueOf: (name: string) => QueueDeclaration
  queueOfJob: (job: string) => QueueDeclaration | undefined
  isListening: (name: string) => boolean
  /**
   * Whether the broker can carry a schedule out as written. Nothing is recorded or changed.
   *
   * @throws {ScheduleMisdeclared} naming the schedule id and the reason.
   * @throws {UnknownQueue} when the schedule's queue is not declared.
   * @throws {UnknownJobName} when that queue does not accept the schedule's job name — a scheduled
   * run of a name nothing declares would fail on every tick instead of once, at declaration.
   */
  assertSchedule: (schedule: ScheduleDeclaration) => void
  /** The declared schedules, of one queue when it is named. */
  schedulesOf: (queue?: string) => ScheduleDeclaration[]
  /**
   * Check every declared schedule, including any written into the configuration without
   * `declareSchedule`, and refuse two under one id.
   *
   * @throws {ScheduleMisdeclared} / {UnknownQueue} / {UnknownJobName} for the first one that fails.
   */
  assertSchedules: () => void
}
