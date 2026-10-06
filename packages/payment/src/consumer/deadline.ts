import { ConsumerRightsError } from '../errors.js'
import { DAY_MS } from './consts.js'
import type { DeadlinePolicy } from './types.local.js'
import type { WithdrawalDeadlineRule, WithdrawalWindow } from './types.js'
import type { WithdrawalDeadlineHelper } from './deadline/types.js'

export const createWithdrawalDeadlineHelper = (): WithdrawalDeadlineHelper => {
  const ruleOf = (rule?: WithdrawalDeadlineRule | DeadlinePolicy): Required<WithdrawalDeadlineRule> => {
    if (rule != null && 'withdrawalDays' in rule) {
      return { days: rule.withdrawalDays, weekendRollover: rule.deadline.weekendRollover, marginDays: rule.deadline.marginDays }
    }

    return { days: rule?.days ?? 14, weekendRollover: rule?.weekendRollover ?? true, marginDays: rule?.marginDays ?? 5 }
  }

  const withdrawalDeadlineOf = (purchasedAt: Date, rule?: WithdrawalDeadlineRule | DeadlinePolicy): Date => {
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

  const lastWithdrawalDayOf = (deadline: Date): Date => {
    const last = new Date(deadline.getTime() - 1)

    return new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth(), last.getUTCDate()))
  }

  const withdrawalOpen = (window: WithdrawalWindow | Date | null | undefined, at: Date = new Date()): boolean => {
    if (window == null) {
      return false
    }
    const { deadline, withdrawnAt, refundedAt } = window instanceof Date ? { deadline: window } as WithdrawalWindow : window

    return deadline != null && withdrawnAt == null && refundedAt == null && at.getTime() < deadline.getTime()
  }

  return { withdrawalDeadlineOf, lastWithdrawalDayOf, withdrawalOpen }
}

export const withdrawalDeadlineHelper = createWithdrawalDeadlineHelper()

/** @deprecated compat:factory-refactor — use `withdrawalDeadlineHelper.withdrawalDeadlineOf(…)` */
export const withdrawalDeadlineOf = (purchasedAt: Date, rule?: WithdrawalDeadlineRule | DeadlinePolicy): Date =>
  withdrawalDeadlineHelper.withdrawalDeadlineOf(purchasedAt, rule)

/** @deprecated compat:factory-refactor — use `withdrawalDeadlineHelper.lastWithdrawalDayOf(…)` */
export const lastWithdrawalDayOf = (deadline: Date): Date => withdrawalDeadlineHelper.lastWithdrawalDayOf(deadline)

/** @deprecated compat:factory-refactor — use `withdrawalDeadlineHelper.withdrawalOpen(…)` */
export const withdrawalOpen = (window: WithdrawalWindow | Date | null | undefined, at?: Date): boolean =>
  withdrawalDeadlineHelper.withdrawalOpen(window, at)
