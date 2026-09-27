import { describe, expect, test } from 'bun:test'
import {
  cancellationEffectiveAt, ConsumerRightsError, DEFAULT_CONSUMER_RIGHTS, lastWithdrawalDayOf, withdrawalDeadlineOf,
  withdrawalOpen,
} from '../src/index.js'

const at = (iso: string): Date => new Date(iso)

describe('withdrawalDeadlineOf', () => {
  test('the pinned examples: 14 days, weekend to Monday, five margin days, exclusive end of day', () => {
    // Wed 2026-09-23 + 14 = Wed 10-07, + 5 margin = Mon 10-12 → ends at the start of 10-13.
    expect(withdrawalDeadlineOf(at('2026-09-23T10:15:00Z'))).toEqual(at('2026-10-13T00:00:00.000Z'))
    // Sat 2026-09-26 + 14 = Sat 10-10 → Mon 10-12, + 5 = Sat 10-17 → ends at the start of 10-18.
    expect(withdrawalDeadlineOf(at('2026-09-26T08:00:00Z'))).toEqual(at('2026-10-18T00:00:00.000Z'))
    // Sun 2026-12-20 + 14 = Sun 2027-01-03 → Mon 01-04, + 5 = Sat 01-09 → ends at the start of 01-10.
    expect(withdrawalDeadlineOf(at('2026-12-20T23:59:59Z'))).toEqual(at('2027-01-10T00:00:00.000Z'))
  })

  test('a deadline is shown as its last included day', () => {
    expect(lastWithdrawalDayOf(at('2026-10-13T00:00:00.000Z'))).toEqual(at('2026-10-12T00:00:00.000Z'))
    expect(lastWithdrawalDayOf(at('2027-01-10T00:00:00.000Z'))).toEqual(at('2027-01-09T00:00:00.000Z'))
    expect(lastWithdrawalDayOf(at('2026-10-13T00:00:00.001Z'))).toEqual(at('2026-10-13T00:00:00.000Z'))
  })

  test('the purchase day is a UTC day, whatever the hour', () => {
    expect(withdrawalDeadlineOf(at('2026-09-23T00:00:00Z'))).toEqual(withdrawalDeadlineOf(at('2026-09-23T23:59:59.999Z')))
  })

  test('a leap day counts', () => {
    // Tue 2028-02-15 + 14 = Tue 02-29, + 1 = 03-01 → ends at the start of 03-02.
    expect(withdrawalDeadlineOf(at('2028-02-15T12:00:00Z'), { marginDays: 1 })).toEqual(at('2028-03-02T00:00:00.000Z'))
  })

  test('margin 0 and no rollover', () => {
    expect(withdrawalDeadlineOf(at('2026-09-23T12:00:00Z'), { marginDays: 0 })).toEqual(at('2026-10-08T00:00:00.000Z'))
    expect(withdrawalDeadlineOf(at('2026-09-26T12:00:00Z'), { marginDays: 0, weekendRollover: false }))
      .toEqual(at('2026-10-11T00:00:00.000Z'))
    expect(withdrawalDeadlineOf(at('2026-09-26T12:00:00Z'), { marginDays: 0 })).toEqual(at('2026-10-13T00:00:00.000Z'))
  })

  test('reads a policy directly', () => {
    // Wed 2026-09-23 + 30 = Fri 10-23, + 5 = Wed 10-28 → ends at the start of 10-29.
    expect(withdrawalDeadlineOf(at('2026-09-23T10:00:00Z'), { ...DEFAULT_CONSUMER_RIGHTS, withdrawalDays: 30 }))
      .toEqual(at('2026-10-29T00:00:00.000Z'))
  })

  test('refuses an invalid date', () => {
    expect(() => withdrawalDeadlineOf(new Date('nope'))).toThrow(ConsumerRightsError)
  })
})

describe('withdrawalOpen', () => {
  const deadline = at('2026-10-09T00:00:00.000Z')

  test('open strictly before the deadline, never after a withdrawal or a refund', () => {
    expect(withdrawalOpen({ deadline }, at('2026-10-08T23:59:59.999Z'))).toBe(true)
    expect(withdrawalOpen({ deadline }, deadline)).toBe(false)
    expect(withdrawalOpen(deadline, at('2026-10-01T00:00:00Z'))).toBe(true)
    expect(withdrawalOpen({ deadline, withdrawnAt: at('2026-10-01T00:00:00Z') }, at('2026-10-02T00:00:00Z'))).toBe(false)
    expect(withdrawalOpen({ deadline, refundedAt: at('2026-10-01T00:00:00Z') }, at('2026-10-02T00:00:00Z'))).toBe(false)
    expect(withdrawalOpen({}, at('2026-10-02T00:00:00Z'))).toBe(false)
    expect(withdrawalOpen(null)).toBe(false)
  })
})

describe('cancellationEffectiveAt', () => {
  const periodEnd = at('2026-10-31T10:00:00.000Z')

  test('no date, or one inside the current period, ends at the period end', () => {
    expect(cancellationEffectiveAt(periodEnd, 'month')).toEqual(periodEnd)
    expect(cancellationEffectiveAt(periodEnd, 'month', at('2026-10-15T00:00:00Z'))).toEqual(periodEnd)
    expect(cancellationEffectiveAt(periodEnd, 'month', periodEnd)).toEqual(periodEnd)
  })

  test('a later date ends at the first boundary on or after it, the 31st clamped per month', () => {
    expect(cancellationEffectiveAt(periodEnd, 'month', at('2026-11-15T00:00:00Z'))).toEqual(at('2026-11-30T10:00:00.000Z'))
    expect(cancellationEffectiveAt(periodEnd, 'month', at('2026-12-01T00:00:00Z'))).toEqual(at('2026-12-31T10:00:00.000Z'))
    expect(cancellationEffectiveAt(periodEnd, 'month', at('2027-02-10T00:00:00Z'))).toEqual(at('2027-02-28T10:00:00.000Z'))
    expect(cancellationEffectiveAt(periodEnd, 'month', at('2027-03-01T00:00:00Z'))).toEqual(at('2027-03-31T10:00:00.000Z'))
    expect(cancellationEffectiveAt(periodEnd, 'year', at('2027-01-01T00:00:00Z'))).toEqual(at('2027-10-31T10:00:00.000Z'))
  })

  test('refuses an invalid date', () => {
    expect(() => cancellationEffectiveAt(periodEnd, 'month', new Date('x'))).toThrow(ConsumerRightsError)
  })
})
