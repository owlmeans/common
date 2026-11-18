import type { CronField } from './types.js'

/** The time zone a pattern is read in when the story names none. */
export const SCHEDULE_DEFAULT_TZ = 'UTC'

/**
 * The SHAPE of a five-field cron pattern — five space-separated fields of digits, names and the cron
 * operators — for the closed design schema. The values themselves are checked by
 * `jobScheduleHelper.isCron`, which a regular expression cannot do readably.
 */
export const CRON_SHAPE = '^[0-9A-Za-z*?,/-]+( [0-9A-Za-z*?,/-]+){4}$'

/** The five fields in order: minute, hour, day of month, month, day of week. */
export const CRON_FIELDS: readonly CronField[] = Object.freeze([
  { min: 0, max: 59 },
  { min: 0, max: 23 },
  { min: 1, max: 31, any: true },
  { min: 1, max: 12, names: ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] },
  // Sunday is 0 and 7 alike.
  { min: 0, max: 7, names: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'], any: true },
])

/** Why a schedule is refused — `jobScheduleHelper.problemsOf`. */
export enum ScheduleProblem {
  /** Neither or both of `cron` and `every`. */
  EveryOrCron = 'every-or-cron',
  /** A `cron` that is not five valid cron fields. */
  Cron = 'cron',
  /** A `cron` with no time zone, or with one that is not an IANA zone. */
  Tz = 'tz',
  /** A time zone beside an interval — it has no wall clock to read. */
  TzWithoutCron = 'tz-without-cron',
  /** An interval that is not a positive whole number of milliseconds. */
  Every = 'every',
  /** `immediately` beside an interval — an interval runs at once already. */
  ImmediatelyWithoutCron = 'immediately-without-cron',
}
