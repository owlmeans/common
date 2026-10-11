import type { PermissionSet } from '@owlmeans/auth'
import { CAPABILITY_LIMIT_SCOPE } from './consts.js'
import type { EntitlementParam } from './types.js'
import type { EntitlementParamHelper } from './entitlement/types.js'

export const createEntitlementParamHelper = (): EntitlementParamHelper => {
  const parseEntitlementParam = (param: string): EntitlementParam => {
    const [scoped, floor] = param.split('>=')
    const colon = scoped.indexOf(':')
    const parsed: EntitlementParam = colon >= 0
      ? { scope: scoped.slice(0, colon), permission: scoped.slice(colon + 1) }
      : { permission: scoped }

    if (floor != null) {
      const value = Number.parseFloat(floor)
      if (!Number.isNaN(value)) {
        parsed.atLeast = value
      }
    }

    return parsed
  }

  const formatEntitlementParam = (parsed: EntitlementParam): string =>
    `${parsed.scope != null ? `${parsed.scope}:` : ''}${parsed.permission}` +
    `${parsed.atLeast != null ? `>=${parsed.atLeast}` : ''}`

  const hasEntitlement = (
    capabilities: PermissionSet[] | undefined, param: string
  ): boolean => {
    if (capabilities == null || capabilities.length < 1) {
      return false
    }
    if (typeof param !== 'string') {
      return false
    }
    const { scope, permission, atLeast } = parseEntitlementParam(param)
    // A limit is never a capability: its room is counted, not granted.
    if (permission === '' || scope === CAPABILITY_LIMIT_SCOPE) {
      return false
    }

    return capabilities.some(set => {
      if (scope != null && set.scope !== scope) {
        return false
      }
      const held = set.permissions?.[permission]
      if (held == null || held === false) {
        return false
      }

      // A floor is a numeric question: a boolean flag, however true, does not answer it.
      return atLeast != null ? typeof held === 'number' && held >= atLeast : true
    })
  }

  const entitlementList = (capabilities: PermissionSet[] | undefined): string[] => {
    const list: string[] = []
    for (const set of capabilities ?? []) {
      for (const [permission, value] of Object.entries(set.permissions ?? {})) {
        if (value == null || value === false) {
          continue
        }
        list.push(formatEntitlementParam({ scope: set.scope, permission }))
      }
    }

    return [...new Set(list)]
  }

  return { parseEntitlementParam, formatEntitlementParam, hasEntitlement, entitlementList }
}

export const entitlementParamHelper = createEntitlementParamHelper()

/** @deprecated compat:factory-refactor — use `entitlementParamHelper.parseEntitlementParam(…)` */
export const parseEntitlementParam = (param: string): EntitlementParam =>
  entitlementParamHelper.parseEntitlementParam(param)

/** @deprecated compat:factory-refactor — use `entitlementParamHelper.formatEntitlementParam(…)` */
export const formatEntitlementParam = (parsed: EntitlementParam): string =>
  entitlementParamHelper.formatEntitlementParam(parsed)

/** @deprecated compat:factory-refactor — use `entitlementParamHelper.hasEntitlement(…)` */
export const hasEntitlement = (capabilities: PermissionSet[] | undefined, param: string): boolean =>
  entitlementParamHelper.hasEntitlement(capabilities, param)
