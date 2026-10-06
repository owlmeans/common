import type { PromoDeclaration, PromoView } from '../types.js'

/** Whether a promo is in force, and how a UI inscribes it. */
export interface PromoHelper {
  /**
   * Whether a grant behind a promo is in force.
   *
   * No promo ⇒ always. Otherwise while `at < until`, or — with `grandfather` — for a subscription
   * created before `until`. `at === until` is already over.
   */
  promoActive: (
    promo: PromoDeclaration | null | undefined, subscribedAt: Date | null | undefined, at?: Date,
  ) => boolean
  /** What a UI needs to inscribe a promo: `undefined` when the grant has none. */
  promoViewOf: (
    promo: PromoDeclaration | null | undefined, subscribedAt: Date | null | undefined, at?: Date,
  ) => PromoView | undefined
}
