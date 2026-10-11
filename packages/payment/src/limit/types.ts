import type { LimitKind, LimitWindow } from '../consts.js'
import type { EntitlementView, LimitParam, LimitView } from '../types.js'

/** The limit windows, the limit gate's parameter, and the questions a view answers about limits. */
export interface PlanLimitHelper {
  /**
   * The key of the counter window `at` falls into — calendar UTC or seven days from the subscription anchor.
   *
   * `'lifetime'` · `'occupancy'` · `'YYYY-MM'` (month) · `'YYYY-MM-DD'` (day).
   *
   * @throws LimitMisdeclared for a window limit without a known window, or an unknown kind.
   */
  windowKeyOf: (kind: LimitKind, window?: LimitWindow | null, at?: Date, anchor?: Date) => string
  /**
   * The calendar UTC or anchored subscription window `at` falls into: `start` inclusive, `resetsAt` exclusive (the first
   * instant of the next window).
   *
   * @throws LimitMisdeclared for an unknown window.
   */
  windowBoundsOf: (window: LimitWindow, at?: Date, anchor?: Date) => { start: Date, resetsAt: Date }
  /** `limit:<key>` · `limit:<key>>=<n>` — the parameter the limit gate takes. */
  formatLimitParam: (key: string, atLeast?: number) => string
  /**
   * Read a limit parameter: `limit:<key>[>=n]`.
   *
   * `null` for anything else — a capability parameter, a bare key, an empty key, a floor that is not
   * a positive number. Never throws: a gate that crashed on a typo would take down the endpoint it
   * guards.
   */
  parseLimitParam: (param: string) => LimitParam | null
  /** Whether a limit has room for `atLeast` more. No limit is no room. */
  hasLimitRoom: (limit: LimitView | null | undefined, atLeast?: number) => boolean
  /** One limit of a view, by key. */
  limitOf: (view: EntitlementView | null | undefined, key: string) => LimitView | null
  /**
   * Whether a view grants a capability parameter — the same predicate as the capability gate
   * (`hasEntitlement`), over the view's GRANTED capabilities. A `limit:` parameter is never a
   * capability and answers `false`.
   */
  capabilityOf: (view: EntitlementView | null | undefined, param: string) => boolean
}
