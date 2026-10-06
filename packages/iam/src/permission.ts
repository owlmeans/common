import { PERMISSION_ACTION_SEPARATOR, RESOURCE_PARAM_SEPARATOR, GateParamErrorCode } from './consts.js'
import type { ParsedPermissionName, PermissionNameHelper } from './permission/types.js'

export const createPermissionNameHelper = (): PermissionNameHelper => {
  const parsePermissionName = (name: string): ParsedPermissionName => {
    const problem = name.includes(RESOURCE_PARAM_SEPARATOR)
      ? {
        code: GateParamErrorCode.UnreachableKey,
        detail: `"${name}" carries a gate selector; "${RESOURCE_PARAM_SEPARATOR}" is never part of a`
          + ' permission name, and nothing ever looks up a name that contains one'
      }
      : undefined

    const idx = name.indexOf(PERMISSION_ACTION_SEPARATOR)
    if (idx < 0) {
      return { name, resource: name, ...(problem != null ? { problem } : {}) }
    }

    const action = name.slice(idx + PERMISSION_ACTION_SEPARATOR.length)

    return {
      name,
      resource: name.slice(0, idx),
      ...(action !== '' ? { action } : {}),
      ...(problem != null ? { problem } : {})
    }
  }

  const composePermissionName = (
    parts: { resource: string, action?: string }
  ): string => parts.action == null || parts.action === ''
    ? parts.resource
    : `${parts.resource}${PERMISSION_ACTION_SEPARATOR}${parts.action}`

  const isPermissionName = (value: string): boolean =>
    value !== '' && !value.includes(RESOURCE_PARAM_SEPARATOR)

  return { parsePermissionName, composePermissionName, isPermissionName }
}

export const permissionNameHelper = createPermissionNameHelper()

/** @deprecated compat:factory-refactor — use `permissionNameHelper.parsePermissionName(…)` */
export const parsePermissionName = (name: string): ParsedPermissionName =>
  permissionNameHelper.parsePermissionName(name)

/** @deprecated compat:factory-refactor — use `permissionNameHelper.isPermissionName(…)` */
export const isPermissionName = (value: string): boolean => permissionNameHelper.isPermissionName(value)
