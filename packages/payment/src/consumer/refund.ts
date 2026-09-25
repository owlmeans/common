import { ConsumerRightsError } from '../errors.js'
import type { PlanWithdrawalComponent } from '../types.js'
import { DAY_MS } from './deadline.js'

// Every amount is computed in BigInt and rounded in the consumer's favour: a deduction rounds
// down, a refund rounds up, and a refund never exceeds what is still unrefunded.

const big = (value: number, field: string): bigint => {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ConsumerRightsError(`refund:${field}`)
  }

  return BigInt(value)
}

/** A usage figure: fractions round DOWN (fewer units used, more reimbursed). */
const units = (value: number, field: string): bigint => {
  if (!Number.isFinite(value)) {
    throw new ConsumerRightsError(`refund:${field}`)
  }

  return BigInt(Math.max(0, Math.floor(value)))
}

const ceilDiv = (a: bigint, b: bigint): bigint => (a + b - 1n) / b
const min = (a: bigint, b: bigint): bigint => a < b ? a : b
const clamp = (value: bigint, low: bigint, high: bigint): bigint => value < low ? low : value > high ? high : value

/**
 * Split `totalMinor` in proportion to `shares` by the largest remainder: every part is the floor
 * of its exact share, and the units left over go one each to the largest fractional parts (the
 * earlier part on a tie). The parts always sum to the total. All-zero shares split evenly.
 */
export const splitByShares = (totalMinor: number, shares: number[]): number[] => {
  if (shares.length === 0) {
    return []
  }
  const total = big(totalMinor, 'total')
  const weights = shares.map((share, index) => big(share, `share:${index}`))
  const even = weights.every(weight => weight === 0n)
  const effective = even ? weights.map(() => 1n) : weights
  const sum = effective.reduce((acc, weight) => acc + weight, 0n)
  const parts = effective.map(weight => (total * weight) / sum)
  const remainders = effective.map((weight, index) => ({ index, rest: (total * weight) % sum }))
  let left = total - parts.reduce((acc, part) => acc + part, 0n)
  remainders.sort((a, b) => a.rest === b.rest ? a.index - b.index : a.rest > b.rest ? -1 : 1)
  for (const { index } of remainders) {
    if (left === 0n) {
      break
    }
    parts[index] += 1n
    left -= 1n
  }

  return parts.map(Number)
}

export interface OneTimeRefundInput {
  paidMinor: number
  /** Already refunded (an earlier partial refund); the refund never exceeds the rest. */
  refundedMinor?: number
  unitsGranted: number
  /** Units used AFTER consent — before it, the consumer bears no cost. Clamped to `0..granted`. */
  unitsUsed: number
}

export interface OneTimeRefund {
  refundMinor: number
  /** The share of the purchase that is unused: `(granted − used) / granted`. */
  netRatio: number
  /** The unused units a withdrawal takes back. */
  unitsReturned: number
}

/**
 * The refund of a one-time purchase (prepaid credits):
 * `min(paid − refunded, ceil(paid × (granted − used) / granted))`. Nothing granted means nothing
 * performed — the whole unrefunded amount. 1256 paid, 125 000 of 500 000 used → 942.
 */
export const oneTimeWithdrawalRefund = (input: OneTimeRefundInput): OneTimeRefund => {
  const paid = big(input.paidMinor, 'paid')
  const open = paid - min(paid, big(input.refundedMinor ?? 0, 'refunded'))
  const granted = units(input.unitsGranted, 'granted')
  if (granted === 0n) {
    return { refundMinor: Number(open), netRatio: 1, unitsReturned: 0 }
  }
  const unused = granted - clamp(units(input.unitsUsed, 'used'), 0n, granted)

  return {
    refundMinor: Number(min(open, ceilDiv(paid * unused, granted))),
    netRatio: Number(unused) / Number(granted),
    unitsReturned: Number(unused),
  }
}

export interface SubscriptionRefundInput {
  paidMinor: number
  refundedMinor?: number
  /** The price net of tax — the base the components split and the deductions come from. */
  netMinor: number
  /** Absent or empty: the whole price is one `time` component. */
  components?: PlanWithdrawalComponent[]
  periodStart: Date
  periodEnd: Date
  /** When the consumer expressly requested the services. None: no time deduction at all. */
  servicesRequestedAt?: Date | null
  withdrawnAt: Date
  /** Units granted with the purchase and used after consent — applied to every `units` component. */
  units?: { granted: number, used: number } | null
}

export interface SubscriptionRefundComponent extends PlanWithdrawalComponent {
  /** The component's part of `netMinor`. */
  amountMinor: number
  deductionMinor: number
}

export interface SubscriptionRefund {
  /** Gross (tax-inclusive) refund, capped at what is still unrefunded. */
  refundMinor: number
  refundNetMinor: number
  timeDeductionMinor: number
  unitsDeductionMinor: number
  elapsedDays: number
  periodDays: number
  unitsUsed?: number
  unitsGranted?: number
  components: SubscriptionRefundComponent[]
}

/**
 * The refund of a subscription's first invoice (CJEU C-641/19 PE Digital). The net price splits
 * into its components by `shareMinor` (largest remainder). A `time` component loses
 * `floor(c × elapsedDays / periodDays)`, the days counted from `max(periodStart,
 * servicesRequestedAt)` and floored — and nothing without a start request. A `units` component
 * loses `floor(c × used / granted)`. The gross refund is `ceil(paid × refundNet / net)`, capped at
 * what is still unrefunded. Net 2000 / paid 2460, services 1000 at 3 of 30 days (−100), credits
 * 1000 with 100 000 of 500 000 used (−200) → net 1700, gross 2091.
 */
export const subscriptionWithdrawalRefund = (input: SubscriptionRefundInput): SubscriptionRefund => {
  const paid = big(input.paidMinor, 'paid')
  const open = paid - min(paid, big(input.refundedMinor ?? 0, 'refunded'))
  const net = big(input.netMinor, 'net')
  const declared = input.components != null && input.components.length > 0
    ? input.components
    : [{ key: 'price', basis: 'time', shareMinor: input.netMinor } satisfies PlanWithdrawalComponent]
  const amounts = splitByShares(input.netMinor, declared.map(component => component.shareMinor))

  const span = input.periodEnd.getTime() - input.periodStart.getTime()
  if (Number.isNaN(span) || Number.isNaN(input.withdrawnAt.getTime())) {
    throw new ConsumerRightsError('refund:period')
  }
  const periodDays = Math.max(1, Math.round(span / DAY_MS))
  const requestedAt = input.servicesRequestedAt
  const from = requestedAt == null ? null : Math.max(input.periodStart.getTime(), requestedAt.getTime())
  const elapsedDays = from == null ? 0
    : Math.min(periodDays, Math.max(0, Math.floor((input.withdrawnAt.getTime() - from) / DAY_MS)))

  const granted = input.units != null ? units(input.units.granted, 'granted') : 0n
  const used = input.units != null ? clamp(units(input.units.used, 'used'), 0n, granted) : 0n

  let timeDeduction = 0n
  let unitsDeduction = 0n
  const components = declared.map((component, index): SubscriptionRefundComponent => {
    const amount = BigInt(amounts[index])
    let deduction = 0n
    if (component.basis === 'time') {
      deduction = (amount * BigInt(elapsedDays)) / BigInt(periodDays)
      timeDeduction += deduction
    } else if (granted > 0n) {
      deduction = (amount * used) / granted
      unitsDeduction += deduction
    }

    return { ...component, amountMinor: amounts[index], deductionMinor: Number(deduction) }
  })

  const refundNet = net - min(net, timeDeduction + unitsDeduction)
  const refund = net === 0n ? open : min(open, ceilDiv(paid * refundNet, net))

  return {
    refundMinor: Number(refund),
    refundNetMinor: Number(refundNet),
    timeDeductionMinor: Number(timeDeduction),
    unitsDeductionMinor: Number(unitsDeduction),
    elapsedDays,
    periodDays,
    ...(input.units != null ? { unitsUsed: Number(used), unitsGranted: Number(granted) } : {}),
    components,
  }
}
