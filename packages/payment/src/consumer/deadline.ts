import { ConsumerRightsError } from '../errors.js'
import type { ConsumerRightsPolicy } from '../types.js'

export const DAY_MS = 86_400_000

export interface WithdrawalDeadlineRule {
  /** Default 14. */
  days?: number
  /** A period ending on a Saturday or Sunday ends on the Monday after. Default on. */
  weekendRollover?: boolean
  /** Whole days added after the rollover, covering public holidays. Default 5. */
  marginDays?: number
}

type DeadlinePolicy = Pick<ConsumerRightsPolicy, 'withdrawalDays' | 'deadline'>

const ruleOf = (rule?: WithdrawalDeadlineRule | DeadlinePolicy): Required<WithdrawalDeadlineRule> => {
  if (rule != null && 'withdrawalDays' in rule) {
    return { days: rule.withdrawalDays, weekendRollover: rule.deadline.weekendRollover, marginDays: rule.deadline.marginDays }
  }

  return { days: rule?.days ?? 14, weekendRollover: rule?.weekendRollover ?? true, marginDays: rule?.marginDays ?? 5 }
}

/**
 * The EXCLUSIVE end of a withdrawal period — the first instant at which it is over.
 *
 * The period starts the day after the purchase (the purchase day is not counted) and lasts `days`
 * UTC calendar days; a last day on a Saturday or Sunday moves to the Monday after; `marginDays`
 * are then added for public holidays and time zones; the result is the start of the next UTC day.
 * Wed 2026-09-23 → 2026-10-13T00:00Z, Sat 2026-09-26 → 2026-10-18T00:00Z, Sun 2026-12-20 →
 * 2027-01-10T00:00Z (14 days, margin 5). Shown to a person as its last included day
 * (`lastWithdrawalDayOf`), never as the exclusive instant.
 *
 * @throws ConsumerRightsError (`deadline`) for an invalid date or rule.
 */
export const withdrawalDeadlineOf = (purchasedAt: Date, rule?: WithdrawalDeadlineRule | DeadlinePolicy): Date => {
  const { days, weekendRollover, marginDays } = ruleOf(rule)
  if (Number.isNaN(purchasedAt.getTime()) || !Number.isSafeInteger(days) || days < 0
    || !Number.isSafeInteger(marginDays) || marginDays < 0) {
    throw new ConsumerRightsError('deadline')
  }
  const purchaseDay = Date.UTC(purchasedAt.getUTCFullYear(), purchasedAt.getUTCMonth(), purchasedAt.getUTCDate())
  let lastDay = purchaseDay + days * DAY_MS
  if (weekendRollover) {
    const weekday = new Date(lastDay).getUTCDay()
    lastDay += weekday === 6 ? 2 * DAY_MS : weekday === 0 ? DAY_MS : 0
  }

  return new Date(lastDay + (marginDays + 1) * DAY_MS)
}

/**
 * The last day a withdrawal is still in time, for display: the UTC calendar day of `deadline − 1 ms`
 * (a deadline is the EXCLUSIVE first instant after the period). 2026-10-13T00:00Z → 2026-10-12;
 * show it as a UTC date, "until the end of 12 October 2026".
 */
export const lastWithdrawalDayOf = (deadline: Date): Date => {
  const last = new Date(deadline.getTime() - 1)

  return new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()))
}

/** What decides whether a purchase can still be withdrawn from. */
export interface WithdrawalWindow {
  deadline?: Date | null
  withdrawnAt?: Date | null
  refundedAt?: Date | null
}

/**
 * Whether a withdrawal window is open at `at`: a deadline exists, `at` is before it, and the
 * purchase was neither withdrawn from nor refunded. A bare deadline is accepted as well.
 */
export const withdrawalOpen = (window: WithdrawalWindow | Date | null | undefined, at: Date = new Date()): boolean => {
  if (window == null) {
    return false
  }
  const { deadline, withdrawnAt, refundedAt } = window instanceof Date ? { deadline: window } as WithdrawalWindow : window

  return deadline != null && withdrawnAt == null && refundedAt == null && at.getTime() < deadline.getTime()
}
