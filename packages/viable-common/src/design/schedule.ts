/**
 * A job the broker runs on its own — the schedule a design gives a job instead of an endpoint that
 * enqueues it.
 *
 * A nightly report has no request to start it: an endpoint asked to enqueue it either never does or
 * invents a button nobody presses. So the design can say WHEN a job runs, and the target declares it
 * with `@owlmeans/queue`'s `declareSchedule`, which refuses a misdeclared schedule at boot. These rules
 * are the queue's own (exactly one of `cron` — the declaration's `pattern` — and `every`, `tz` with a
 * cron pattern only), checked here so a schedule that would be refused never reaches the generated code.
 */
import { CRON_FIELDS, ScheduleProblem } from './schedule/consts.js'
import type { CronField, JobScheduleHelper } from './schedule/types.js'
import type { StoryDesignJob, StoryDesignJobSchedule } from './types.js'

export const createJobScheduleHelper = (): JobScheduleHelper => {
  /** A field's value as a number — a digit string, or one of the field's names. */
  const valueOf = (text: string, field: CronField): number | null => {
    if (/^\d+$/.test(text)) {
      const value = Number(text)
      return value >= field.min && value <= field.max ? value : null
    }
    const at = field.names?.indexOf(text.toUpperCase()) ?? -1
    // Names count from the field's own first value: `JAN` is 1, `SUN` is 0.
    return at < 0 ? null : field.min + at
  }

  /** One item of a field's list: `*`, `?`, `5`, `1-5`, `*\/15`, `1-30/2`, `MON-FRI`. */
  const itemOk = (item: string, field: CronField): boolean => {
    if (item === '?') return field.any === true
    const [range, step, extra] = item.split('/')
    if (extra != null || range == null || range === '') return false
    if (step != null && !(/^\d+$/.test(step) && Number(step) > 0)) return false
    if (range === '*') return true
    const [from, to, more] = range.split('-')
    if (more != null || from == null) return false
    const start = valueOf(from, field)
    if (start == null) return false
    if (to == null) return true
    const end = valueOf(to, field)

    return end != null && end >= start
  }

  const isCron: JobScheduleHelper['isCron'] = pattern => {
    if (typeof pattern !== 'string') return false
    const fields = pattern.trim().split(/\s+/)
    if (fields.length !== CRON_FIELDS.length) return false

    return fields.every((text, at) => text.split(',').every(item => itemOk(item, CRON_FIELDS[at]!)))
  }

  const isTimeZone: JobScheduleHelper['isTimeZone'] = tz => {
    if (typeof tz !== 'string' || tz.trim() === '') return false
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: tz })
      return true
    } catch {
      return false
    }
  }

  const problemsOf: JobScheduleHelper['problemsOf'] = schedule => {
    const problems: ScheduleProblem[] = []
    const cron = schedule.cron != null
    const every = schedule.every != null
    if (cron === every) problems.push(ScheduleProblem.EveryOrCron)
    if (cron && !isCron(schedule.cron!)) problems.push(ScheduleProblem.Cron)
    if (cron && !isTimeZone(schedule.tz ?? '')) problems.push(ScheduleProblem.Tz)
    if (!cron && schedule.tz != null) problems.push(ScheduleProblem.TzWithoutCron)
    if (every && !(Number.isSafeInteger(schedule.every) && schedule.every! > 0)) problems.push(ScheduleProblem.Every)
    if (!cron && schedule.immediately === true) problems.push(ScheduleProblem.ImmediatelyWithoutCron)

    return problems
  }

  const scheduleOf: JobScheduleHelper['scheduleOf'] = (job: Pick<StoryDesignJob, 'schedule'>): StoryDesignJobSchedule | null =>
    job.schedule != null && typeof job.schedule === 'object' && problemsOf(job.schedule).length === 0 ? job.schedule : null

  const isScheduled: JobScheduleHelper['isScheduled'] = job => scheduleOf(job) != null

  return { isCron, isTimeZone, problemsOf, scheduleOf, isScheduled }
}

export const jobScheduleHelper = createJobScheduleHelper()
