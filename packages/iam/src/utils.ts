import type { Authorization, PermissionSet } from '@owlmeans/auth'
import type { OidcPermissionSetClaim } from '@owlmeans/oidc'
import type { HasPermissionOptions } from './utils/types.js'

/** The organization a set is bound to, when it is a claim set that kept its binding. */
const boundTo = (set: PermissionSet): string | undefined => (set as OidcPermissionSetClaim).entitySlug

/**
 * True when any PermissionSet grants `permission`. An unscoped set (no resources)
 * satisfies a resourceId check too — a project-wide grant covers every resource.
 *
 * The organization follows the same rule the other way round, fail-closed: a set without a binding
 * applies everywhere, a bound one only when `opts.entitySlug` names its organization. A relying
 * party strips the binding from the sets of the organization a session acts in and drops every
 * other bound set, so a bound set reaching a check is one that leaked — and it must not count
 * merely because the caller did not say where the request acts.
 */
export const hasPermission = (
  auth: Authorization,
  permission: string,
  opts?: HasPermissionOptions
): boolean => auth.permissions?.some(set =>
  (opts?.scope == null || set.scope === opts.scope)
  && set.permissions[permission] === true
  && (opts?.resourceId == null || set.resources == null || set.resources.includes(opts.resourceId))
  && (boundTo(set) == null || (opts?.entitySlug != null && boundTo(set) === opts.entitySlug))
) ?? false
