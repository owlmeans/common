import type { Authorization } from '@owlmeans/auth'

export interface HasPermissionOptions {
  /** Restrict the check to PermissionSets of this scope (the project's clientId). */
  scope?: string
  /** Resource-scoped check: the set must list this id — unless the set itself is unscoped. */
  resourceId?: string
}

/**
 * True when any PermissionSet grants `permission`. An unscoped set (no resources)
 * satisfies a resourceId check too — a project-wide grant covers every resource.
 */
export const hasPermission = (
  auth: Authorization,
  permission: string,
  opts?: HasPermissionOptions
): boolean => auth.permissions?.some(set =>
  (opts?.scope == null || set.scope === opts.scope)
  && set.permissions[permission] === true
  && (opts?.resourceId == null || set.resources == null || set.resources.includes(opts.resourceId))
) ?? false
