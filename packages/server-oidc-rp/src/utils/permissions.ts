import type { OidcPermissionSetClaim } from '@owlmeans/oidc'

/**
 * Shape-validates a `permissions` token claim into permission sets.
 * An empty array is a valid claim for an authenticated person with no grants;
 * undefined is reserved for missing or malformed claims, which keeps the
 * claims-based gate path inert outside the integrated IAM mode.
 *
 * A set may be bound to an organization (`entitySlug`). The claim keeps that binding: what a
 * token may carry of it is `actingPermissionSets`' decision, not this one's.
 */
export const extractPermissionSets = (claim: unknown): OidcPermissionSetClaim[] | undefined => {
  if (!Array.isArray(claim)) {
    return undefined
  }

  const sets = claim.filter((set): set is OidcPermissionSetClaim =>
    set != null && typeof set === 'object'
    && typeof (set as OidcPermissionSetClaim).scope === 'string'
    && (set as OidcPermissionSetClaim).permissions != null
    && typeof (set as OidcPermissionSetClaim).permissions === 'object'
    && !Array.isArray((set as OidcPermissionSetClaim).permissions)
    && ((set as OidcPermissionSetClaim).resources == null || (
      Array.isArray((set as OidcPermissionSetClaim).resources)
      && (set as OidcPermissionSetClaim).resources!.every(res => typeof res === 'string')
    ))
    && ((set as OidcPermissionSetClaim).entitySlug == null
      || typeof (set as OidcPermissionSetClaim).entitySlug === 'string')
  )

  return sets.length > 0 || claim.length === 0 ? sets : undefined
}
