import { LimitKind, LimitWindow } from './consts.js'
import {
  CAPABILITY_LIMIT_SCOPE, formatEntitlementParam, hasEntitlement, parseEntitlementParam,
} from './entitlement.js'
import { LimitMisdeclared } from './errors.js'
import type { EntitlementView, LimitView } from './types.js'
import type { PermissionSet } from '@owlmeans/auth'

/** The window key a lifetime limit's counter lives under. */
export const LIFETIME_WINDOW = 'lifetime'

/** The window key an occupancy limit's counter lives under. */
export const OCCUPANCY_WINDOW = 'occupancy'

const pad = (value: number): string => String(value).padStart(2, '0')

/**
 * The key of the counter window `at` falls into — calendar UTC.
 *
 * `'lifetime'` · `'occupancy'` · `'YYYY-MM'` (month) · `'YYYY-MM-DD'` (day).
 *
 * @throws LimitMisdeclared for a window limit without a known window, or an unknown kind.
 */
export const windowKeyOf = (
  kind: LimitKind, window?: LimitWindow | null, at: Date = new Date(),
): string => {
  switch (kind) {
    case LimitKind.Lifetime:
      return LIFETIME_WINDOW
    case LimitKind.Occupancy:
      return OCCUPANCY_WINDOW
    case LimitKind.Window: {
      const month = `${at.getUTCFullYear()}-${pad(at.getUTCMonth() + 1)}`
      switch (window) {
        case LimitWindow.Month:
          return month
        case LimitWindow.Day:
          return `${month}-${pad(at.getUTCDate())}`
      }
      throw new LimitMisdeclared(`window:${window ?? 'missing'}`)
    }
  }
  throw new LimitMisdeclared(`kind:${kind}`)
}

/**
 * The calendar UTC window `at` falls into: `start` inclusive, `resetsAt` exclusive (the first
 * instant of the next window).
 *
 * @throws LimitMisdeclared for an unknown window.
 */
export const windowBoundsOf = (
  window: LimitWindow, at: Date = new Date(),
): { start: Date, resetsAt: Date } => {
  const year = at.getUTCFullYear()
  const month = at.getUTCMonth()
  switch (window) {
    case LimitWindow.Month:
      return { start: new Date(Date.UTC(year, month, 1)), resetsAt: new Date(Date.UTC(year, month + 1, 1)) }
    case LimitWindow.Day: {
      const day = at.getUTCDate()
      return {
        start: new Date(Date.UTC(year, month, day)), resetsAt: new Date(Date.UTC(year, month, day + 1)),
      }
    }
  }
  throw new LimitMisdeclared(`window:${window}`)
}

/** `limit:<key>` · `limit:<key>>=<n>` — the parameter the limit gate takes. */
export const formatLimitParam = (key: string, atLeast?: number): string =>
  formatEntitlementParam({ scope: CAPABILITY_LIMIT_SCOPE, permission: key, atLeast })

export interface LimitParam {
  key: string
  /** How much room the requirement needs. `1` when the parameter states no floor. */
  atLeast: number
}

/**
 * Read a limit parameter: `limit:<key>[>=n]`.
 *
 * `null` for anything else — a capability parameter, a bare key, an empty key, a floor that is not
 * a positive number. Never throws: a gate that crashed on a typo would take down the endpoint it
 * guards.
 */
export const parseLimitParam = (param: string): LimitParam | null => {
  if (typeof param !== 'string') {
    return null
  }
  const parsed = parseEntitlementParam(param)
  if (parsed.scope !== CAPABILITY_LIMIT_SCOPE || parsed.permission === '') {
    return null
  }
  const atLeast = parsed.atLeast ?? 1
  if (!Number.isFinite(atLeast) || atLeast <= 0) {
    return null
  }

  return { key: parsed.permission, atLeast }
}

/** Whether a limit has room for `atLeast` more. No limit is no room. */
export const hasLimitRoom = (limit: LimitView | null | undefined, atLeast: number = 1): boolean =>
  limit != null && limit.remaining >= atLeast

/** One limit of a view, by key. */
export const limitOf = (
  view: EntitlementView | null | undefined, key: string,
): LimitView | null => view?.limits.find(limit => limit.key === key) ?? null

/**
 * Whether a view grants a capability parameter — the same predicate as the capability gate
 * (`hasEntitlement`), over the view's GRANTED capabilities. A `limit:` parameter is never a
 * capability and answers `false`.
 */
export const capabilityOf = (view: EntitlementView | null | undefined, param: string): boolean => {
  if (view == null) {
    return false
  }
  // One set per row, so two grants of one permission are two chances — exactly as the declared
  // sets they were built from.
  const sets: PermissionSet[] = view.capabilities
    .filter(capability => capability.granted)
    .map(capability => ({
      scope: capability.scope, permissions: { [capability.permission]: capability.value },
    }))

  return hasEntitlement(sets, param)
}
