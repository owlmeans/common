import { LimitKind, LimitWindow, CAPABILITY_LIMIT_SCOPE, LIFETIME_WINDOW, OCCUPANCY_WINDOW } from './consts.js'
import { entitlementParamHelper } from './entitlement.js'
import { LimitMisdeclared } from './errors.js'
import type { EntitlementView, LimitView, LimitParam } from './types.js'
import type { PermissionSet } from '@owlmeans/auth'
import type { PlanLimitHelper } from './limit/types.js'

const pad = (value: number): string => String(value).padStart(2, '0')

export const createPlanLimitHelper = (): PlanLimitHelper => {
  const windowKeyOf = (
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

  const windowBoundsOf = (
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

  const formatLimitParam = (key: string, atLeast?: number): string =>
    entitlementParamHelper.formatEntitlementParam({ scope: CAPABILITY_LIMIT_SCOPE, permission: key, atLeast })

  const parseLimitParam = (param: string): LimitParam | null => {
    if (typeof param !== 'string') {
      return null
    }
    const parsed = entitlementParamHelper.parseEntitlementParam(param)
    if (parsed.scope !== CAPABILITY_LIMIT_SCOPE || parsed.permission === '') {
      return null
    }
    const atLeast = parsed.atLeast ?? 1
    if (!Number.isFinite(atLeast) || atLeast <= 0) {
      return null
    }

    return { key: parsed.permission, atLeast }
  }

  const hasLimitRoom = (limit: LimitView | null | undefined, atLeast: number = 1): boolean =>
    limit != null && limit.remaining >= atLeast

  const limitOf = (
    view: EntitlementView | null | undefined, key: string,
  ): LimitView | null => view?.limits.find(limit => limit.key === key) ?? null

  const capabilityOf = (view: EntitlementView | null | undefined, param: string): boolean => {
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

    return entitlementParamHelper.hasEntitlement(sets, param)
  }

  return { windowKeyOf, windowBoundsOf, formatLimitParam, parseLimitParam, hasLimitRoom, limitOf, capabilityOf }
}

export const planLimitHelper = createPlanLimitHelper()

/** @deprecated compat:factory-refactor — use `planLimitHelper.windowKeyOf(…)` */
export const windowKeyOf = (kind: LimitKind, window?: LimitWindow | null, at?: Date): string =>
  planLimitHelper.windowKeyOf(kind, window, at)

/** @deprecated compat:factory-refactor — use `planLimitHelper.windowBoundsOf(…)` */
export const windowBoundsOf = (window: LimitWindow, at?: Date): { start: Date, resetsAt: Date } =>
  planLimitHelper.windowBoundsOf(window, at)

/** @deprecated compat:factory-refactor — use `planLimitHelper.formatLimitParam(…)` */
export const formatLimitParam = (key: string, atLeast?: number): string =>
  planLimitHelper.formatLimitParam(key, atLeast)

/** @deprecated compat:factory-refactor — use `planLimitHelper.parseLimitParam(…)` */
export const parseLimitParam = (param: string): LimitParam | null => planLimitHelper.parseLimitParam(param)

/** @deprecated compat:factory-refactor — use `planLimitHelper.hasLimitRoom(…)` */
export const hasLimitRoom = (limit: LimitView | null | undefined, atLeast?: number): boolean =>
  planLimitHelper.hasLimitRoom(limit, atLeast)

/** @deprecated compat:factory-refactor — use `planLimitHelper.limitOf(…)` */
export const limitOf = (view: EntitlementView | null | undefined, key: string): LimitView | null =>
  planLimitHelper.limitOf(view, key)

/** @deprecated compat:factory-refactor — use `planLimitHelper.capabilityOf(…)` */
export const capabilityOf = (view: EntitlementView | null | undefined, param: string): boolean =>
  planLimitHelper.capabilityOf(view, param)
