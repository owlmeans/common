import type { PromoDeclaration, PromoView } from './types.js'

/**
 * A date as epoch milliseconds. A declaration read back from JSON carries an ISO string where the
 * type says `Date`; an unparseable value is `NaN`, which fails every comparison — so a broken
 * promo is never in force.
 */
const timeOf = (value: Date | string | number | null | undefined): number =>
  value == null ? Number.NaN : value instanceof Date ? value.getTime() : new Date(value).getTime()

const grandfathers = (promo: PromoDeclaration, subscribedAt: Date | null | undefined): boolean =>
  promo.grandfather === true && timeOf(subscribedAt) < timeOf(promo.until)

/**
 * Whether a grant behind a promo is in force.
 *
 * No promo ⇒ always. Otherwise while `at < until`, or — with `grandfather` — for a subscription
 * created before `until`. `at === until` is already over.
 */
export const promoActive = (
  promo: PromoDeclaration | null | undefined,
  subscribedAt: Date | null | undefined,
  at: Date = new Date(),
): boolean => {
  if (promo == null) {
    return true
  }

  return timeOf(at) < timeOf(promo.until) || grandfathers(promo, subscribedAt)
}

/** What a UI needs to inscribe a promo: `undefined` when the grant has none. */
export const promoViewOf = (
  promo: PromoDeclaration | null | undefined,
  subscribedAt: Date | null | undefined,
  at: Date = new Date(),
): PromoView | undefined => promo == null ? undefined : {
  until: new Date(timeOf(promo.until)),
  grandfathered: grandfathers(promo, subscribedAt),
  active: promoActive(promo, subscribedAt, at),
}
