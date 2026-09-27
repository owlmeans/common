import { ConsumerRightsError } from '../errors.js'

export type BillingInterval = 'month' | 'year'

/** `anchor` moved by `months` calendar months (UTC), its day clamped to the target month's end. */
const addMonths = (anchor: Date, months: number): Date => {
  const year = anchor.getUTCFullYear()
  const month = anchor.getUTCMonth() + months
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate()

  return new Date(Date.UTC(
    year, month, Math.min(anchor.getUTCDate(), lastDay),
    anchor.getUTCHours(), anchor.getUTCMinutes(), anchor.getUTCSeconds(), anchor.getUTCMilliseconds(),
  ))
}

/**
 * When an ordinary cancellation takes effect. No requested date, or one on or before the current
 * period's end, ends the contract at `periodEnd`; a later date ends it at the first period
 * boundary on or after that date — whole intervals stepped from `periodEnd`, each step measured
 * from `periodEnd` itself so a 31st stays the 31st where the month has one.
 *
 * @throws ConsumerRightsError (`cancellation:date`) for an invalid date.
 */
export const cancellationEffectiveAt = (periodEnd: Date, interval: BillingInterval, requested?: Date | null): Date => {
  if (Number.isNaN(periodEnd.getTime()) || (requested != null && Number.isNaN(requested.getTime()))) {
    throw new ConsumerRightsError('cancellation:date')
  }
  if (requested == null || requested.getTime() <= periodEnd.getTime()) {
    return periodEnd
  }
  const step = interval === 'year' ? 12 : 1
  let count = 1
  let candidate = addMonths(periodEnd, step)
  while (candidate.getTime() < requested.getTime()) {
    count += 1
    candidate = addMonths(periodEnd, step * count)
  }

  return candidate
}
