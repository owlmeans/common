import type { Authorization, PermissionSet } from '@owlmeans/auth'
import type { OidcPermissionSetClaim } from '@owlmeans/oidc'
import { IamUnsupported } from './errors.js'

export interface HasPermissionOptions {
  /** Restrict the check to PermissionSets of this scope (the project's clientId). */
  scope?: string
  /** Resource-scoped check: the set must list this id — unless the set itself is unscoped. */
  resourceId?: string
  /**
   * The organization the request acts in. A set bound to an organization (one carrying
   * `entitySlug`) counts only when this names that same organization.
   */
  entitySlug?: string
}

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

/** Keys a facet stand-in answers `undefined` for, so it is never mistaken for a thenable or a primitive. */
const INERT_KEYS = new Set<PropertyKey>(['then', 'toJSON'])

/**
 * A facet a backend cannot provide: every method throws `IamUnsupported(what)`.
 *
 * It throws SYNCHRONOUSLY, because a facet may carry synchronous methods (`subjects.identify`) and a
 * rejected promise would hand those a value of the wrong type; an awaited call rejects the same way
 * either way. Caller code turns the refusal into a fallback, exactly as for any other unsupported
 * operation.
 */
export const unsupportedFacet = <T extends object>(what: string): T =>
  new Proxy(Object.freeze({}) as T, {
    get: (_, key) => typeof key === 'symbol' || INERT_KEYS.has(key)
      ? undefined
      : () => { throw new IamUnsupported(what) },
  })
