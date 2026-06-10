import type { PermissionSet } from '@owlmeans/auth'

/**
 * Shape-validates a `permissions` token claim into PermissionSet[].
 * Returns undefined unless the claim is an array of conforming sets — Keycloak
 * tokens (or any foreign claim) never produce a conforming value, which keeps
 * the claims-based gate path inert outside the integrated IAM mode.
 */
export const extractPermissionSets = (claim: unknown): PermissionSet[] | undefined => {
  if (!Array.isArray(claim) || claim.length < 1) {
    return undefined
  }

  const sets = claim.filter((set): set is PermissionSet =>
    set != null && typeof set === 'object'
    && typeof (set as PermissionSet).scope === 'string'
    && (set as PermissionSet).permissions != null
    && typeof (set as PermissionSet).permissions === 'object'
    && !Array.isArray((set as PermissionSet).permissions)
    && ((set as PermissionSet).resources == null || (
      Array.isArray((set as PermissionSet).resources)
      && (set as PermissionSet).resources!.every(res => typeof res === 'string')
    ))
  )

  return sets.length > 0 ? sets : undefined
}
