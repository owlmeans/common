import { PERMISSION_ACTION_SEPARATOR, RESOURCE_PARAM_SEPARATOR, GateParamErrorCode } from './consts.js'
import type { ParsedPermissionName } from './types.js'

/**
 * Read a permission NAME.
 *
 * The name is `<resource>--<action>`, with TWO hyphens. One hyphen is not a separator: `enquiry-view`
 * is a resource called `enquiry-view` carrying no action, and it must keep parsing that way — a name
 * already granted somewhere cannot be re-interpreted without orphaning the grant.
 *
 * A name never carries a gate selector. `@` is the gate's syntax, and a name containing one is
 * exactly the corruption this function exists to make visible, so it is reported through `problem`
 * rather than quietly split.
 */
export const parsePermissionName = (name: string): ParsedPermissionName => {
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

/** Compose a permission name. The inverse of `parsePermissionName`. */
export const composePermissionName = (
  parts: { resource: string, action?: string }
): string => parts.action == null || parts.action === ''
  ? parts.resource
  : `${parts.resource}${PERMISSION_ACTION_SEPARATOR}${parts.action}`

/** True when the value is a usable permission name — well-formed and carrying no gate selector. */
export const isPermissionName = (value: string): boolean =>
  value !== '' && !value.includes(RESOURCE_PARAM_SEPARATOR)
