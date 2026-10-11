import type { DeadlinePolicy } from '../types.local.js'
import type { WithdrawalDeadlineRule, WithdrawalWindow } from '../types.js'

/** The withdrawal period: its exclusive end, its last day for display, and whether it is open. */
export interface WithdrawalDeadlineHelper {
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
  withdrawalDeadlineOf: (purchasedAt: Date, rule?: WithdrawalDeadlineRule | DeadlinePolicy) => Date
  /**
   * The last day a withdrawal is still in time, for display: the UTC calendar day of `deadline − 1 ms`
   * (a deadline is the EXCLUSIVE first instant after the period). 2026-10-13T00:00Z → 2026-10-12;
   * show it as a UTC date, "until the end of 12 October 2026".
   */
  lastWithdrawalDayOf: (deadline: Date) => Date
  /**
   * Whether a withdrawal window is open at `at`: a deadline exists, `at` is before it, and the
   * purchase was neither withdrawn from nor refunded. A bare deadline is accepted as well.
   */
  withdrawalOpen: (window: WithdrawalWindow | Date | null | undefined, at?: Date) => boolean
}
