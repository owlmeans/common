import type { Authorization, PermissionSet } from '@owlmeans/auth'
import type { IamPermissionDefinition } from './types.js'

/** Resolve inherited blanket permissions without writing them onto a person's profile. */
export const mergePermissionDefaults = (
  stored: PermissionSet[], clientId: string, definitions: IamPermissionDefinition[]
): PermissionSet[] => {
  const scoped = stored.filter(set => set.scope === clientId)
  const explicit = new Set(scoped
    .filter(set => set.title == null && set.resources == null)
    .flatMap(set => Object.keys(set.permissions)))
  const inherited = definitions
    .filter(def => def.defaultEnabled === true && !explicit.has(def.name))
    .map(def => def.name)

  return inherited.length === 0 ? scoped : [
    ...scoped,
    { scope: clientId, permissions: Object.fromEntries(inherited.map(name => [name, true])) },
  ]
}

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
