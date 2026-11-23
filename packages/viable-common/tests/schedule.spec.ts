import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { ProjectArea } from '../src/areas/consts.js'
import {
  NO_RUNTIME, ScheduleProblem, WorkcardDesignSchema, jobScheduleHelper, workcardDesignHelper,
} from '../src/design/index.js'
import type { WorkcardDesign, WorkcardDesignJob, WorkcardDesignJobSchedule } from '../src/design/index.js'

const JOB: WorkcardDesignJob = {
  queue: 'app-jobs', name: 'inventory-report:build', path: '', purpose: 'Builds the previous day\'s report.',
  reason: 'It is scheduled rather than requested.', idempotency: 'Skips a day whose report is stored.',
}

const designWith = (schedule?: WorkcardDesignJobSchedule | null): WorkcardDesign => ({
  ...workcardDesignHelper.emptyWorkcardDesign({ code: 'US-NIGHT', narrative: 'A nightly report.', area: ProjectArea.Admin }),
  runtime: { ...NO_RUNTIME, worker: true, jobs: [{ ...JOB, ...(schedule !== undefined ? { schedule } : {}) } as WorkcardDesignJob] },
})

describe('viable-common - a job\'s schedule', () => {
  test('accepts five valid cron fields — numbers, names, ranges, lists and steps', () => {
    for (const pattern of ['7 2 * * *', '*/15 * * * *', '0 9 * * MON-FRI', '3 4 1,15 * ?', '30 23 * JAN-MAR 0', '0 0 * * 7', '5-55/10 8-18 * * 1-5']) {
      expect({ pattern, ok: jobScheduleHelper.isCron(pattern) }).toEqual({ pattern, ok: true })
    }
  })

  test('refuses a pattern of another arity or with a value out of its field', () => {
    for (const pattern of ['', '* * * *', '0 7 2 * * *', '60 2 * * *', '7 24 * * *', '7 2 0 * *', '7 2 * 13 *', '7 2 * * 8', '7 2 * * FOO', '5-1 * * * *', '*/0 * * * *', '? * * * *', 'every night']) {
      expect({ pattern, ok: jobScheduleHelper.isCron(pattern) }).toEqual({ pattern, ok: false })
    }
  })

  test('knows an IANA time zone from a made-up one', () => {
    expect(jobScheduleHelper.isTimeZone('Europe/London')).toBe(true)
    expect(jobScheduleHelper.isTimeZone('UTC')).toBe(true)
    expect(jobScheduleHelper.isTimeZone('Mars/Olympus')).toBe(false)
    expect(jobScheduleHelper.isTimeZone('')).toBe(false)
  })

  test('holds a schedule to the queue\'s rules: one of cron and every, a zone with a cron pattern only', () => {
    expect(jobScheduleHelper.problemsOf({ cron: '7 2 * * *', tz: 'Europe/London' })).toEqual([])
    expect(jobScheduleHelper.problemsOf({ cron: '7 2 * * *', tz: 'UTC', immediately: true })).toEqual([])
    expect(jobScheduleHelper.problemsOf({ every: 15 * 60_000 })).toEqual([])
    expect(jobScheduleHelper.problemsOf({})).toEqual([ScheduleProblem.EveryOrCron])
    expect(jobScheduleHelper.problemsOf({ cron: '7 2 * * *', tz: 'UTC', every: 60_000 })).toEqual([ScheduleProblem.EveryOrCron])
    expect(jobScheduleHelper.problemsOf({ cron: '7 2 * * *' })).toEqual([ScheduleProblem.Tz])
    expect(jobScheduleHelper.problemsOf({ cron: 'nightly', tz: 'UTC' })).toEqual([ScheduleProblem.Cron])
    expect(jobScheduleHelper.problemsOf({ every: 60_000, tz: 'UTC' })).toEqual([ScheduleProblem.TzWithoutCron])
    expect(jobScheduleHelper.problemsOf({ every: 0.5 })).toEqual([ScheduleProblem.Every])
    expect(jobScheduleHelper.problemsOf({ every: 60_000, immediately: true })).toEqual([ScheduleProblem.ImmediatelyWithoutCron])
  })

  test('answers only a valid schedule — a job with none or a broken one is an endpoint\'s to enqueue', () => {
    expect(jobScheduleHelper.scheduleOf({ schedule: { cron: '7 2 * * *', tz: 'Europe/London' } })).toEqual({ cron: '7 2 * * *', tz: 'Europe/London' })
    expect(jobScheduleHelper.isScheduled({ schedule: { every: 900_000 } })).toBe(true)
    expect(jobScheduleHelper.isScheduled(JOB)).toBe(false)
    expect(jobScheduleHelper.isScheduled({ schedule: { cron: '7 2 * * *' } })).toBe(false)
  })
})

describe('viable-common - the design schema on a job\'s schedule', () => {
  const validate = new Ajv({ allErrors: true, strict: false }).compile(WorkcardDesignSchema)

  test('accepts a job with no schedule, a null one, a cron pattern with its zone and an interval', () => {
    expect(validate(designWith())).toBe(true)
    expect(validate(designWith(null))).toBe(true)
    expect(validate(designWith({ cron: '7 2 * * *', tz: 'Europe/London' }))).toBe(true)
    expect(validate(designWith({ cron: '7 2 * * *', tz: 'UTC', immediately: true }))).toBe(true)
    expect(validate(designWith({ every: 900_000 }))).toBe(true)
  })

  test('refuses both, neither, a cron pattern without its zone, a zone beside an interval and a stray field', () => {
    expect(validate(designWith({ cron: '7 2 * * *', tz: 'UTC', every: 60_000 }))).toBe(false)
    expect(validate(designWith({}))).toBe(false)
    expect(validate(designWith({ cron: '7 2 * * *' }))).toBe(false)
    expect(validate(designWith({ every: 60_000, tz: 'UTC' }))).toBe(false)
    expect(validate(designWith({ cron: 'every night', tz: 'UTC' }))).toBe(false)
    expect(validate(designWith({ every: 0 }))).toBe(false)
    expect(validate(designWith({ every: 60_000, pattern: '* * * * *' } as never))).toBe(false)
  })
})
