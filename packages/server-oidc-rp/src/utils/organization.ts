import type { Auth, PermissionSet } from '@owlmeans/auth'
import type { ResolvedEntity } from '@owlmeans/entrypoint'
import type { OidcOrganizationClaim, OidcOrganizationItem, OidcPermissionSetClaim } from '@owlmeans/oidc'

const isOptionalString = (value: unknown): boolean => value == null || typeof value === 'string'

/**
 * Shape-validates an `organizations` claim.
 *
 * `undefined` means the provider did not answer with one at all — a client that never asked for
 * `ORGANIZATIONS_SCOPE` — and keeps the relying party on its pre-tenancy behaviour. An entry that
 * does not carry both names is dropped: one without a key could not be followed across a rename,
 * one without a slug could not be put on a token.
 */
export const extractOrganizations = (claim: unknown): OidcOrganizationClaim[] | undefined => {
  if (!Array.isArray(claim)) {
    return undefined
  }

  return claim.filter((org): org is OidcOrganizationClaim =>
    org != null && typeof org === 'object'
    && typeof (org as OidcOrganizationClaim).entitySlug === 'string' && (org as OidcOrganizationClaim).entitySlug !== ''
    && typeof (org as OidcOrganizationClaim).entityKey === 'string' && (org as OidcOrganizationClaim).entityKey !== ''
    && typeof (org as OidcOrganizationClaim).owner === 'boolean'
    && isOptionalString((org as OidcOrganizationClaim).title)
    && ((org as OidcOrganizationClaim).home == null || typeof (org as OidcOrganizationClaim).home === 'boolean')
    && ((org as OidcOrganizationClaim).groups == null || (
      Array.isArray((org as OidcOrganizationClaim).groups)
      && (org as OidcOrganizationClaim).groups!.every(group => typeof group === 'string')
    ))
  )
}

export interface OrganizationSelector {
  /** The organization a running session acts in. When given it is the only acceptable answer. */
  entityKey?: string
  /** The organization a person asked to act in at sign-in. */
  entitySlug?: string
}

/**
 * The organization a session acts in.
 *
 * At sign-in (no `entityKey`) the requested slug wins when the subject belongs to it, then the
 * provider's home organization, then the first. A running session (`entityKey`) keeps exactly the
 * organization it acts in and gets `undefined` once the subject no longer belongs to it — never a
 * silent move into another one, which would change what every later request is authorized for.
 */
export const pickOrganization = (
  orgs: OidcOrganizationClaim[], selector: OrganizationSelector = {}
): OidcOrganizationClaim | undefined => {
  if (selector.entityKey != null) {
    return orgs.find(org => org.entityKey === selector.entityKey)
  }

  return (selector.entitySlug != null ? orgs.find(org => org.entitySlug === selector.entitySlug) : undefined)
    ?? orgs.find(org => org.home === true)
    ?? orgs[0]
}

/**
 * The permission sets a browser token may carry for the acting organization.
 *
 * Unbound sets apply everywhere and are kept. A bound set is kept only for the acting organization,
 * and loses its `entitySlug` on the way: the token is already that organization's, and a set of
 * another organization must never reach a browser at all. With no acting organization every bound
 * set is dropped.
 */
export const actingPermissionSets = (
  sets: OidcPermissionSetClaim[], entitySlug?: string
): PermissionSet[] => sets.flatMap(({ entitySlug: bound, ...set }) =>
  bound == null || (entitySlug != null && bound === entitySlug) ? [set] : []
)

/**
 * `user` as a browser token of a session acting in `org`: that organization's slug, its groups
 * and its flattened permission sets — and nothing left over from the organization acted in before.
 */
export const actingAuth = <T extends Auth>(user: T, org: OidcOrganizationClaim, sets?: OidcPermissionSetClaim[]): T => {
  const { groups: _groups, permissions: _permissions, permissioned: _permissioned, ...rest } = user

  return {
    ...rest,
    entitySlug: org.entitySlug,
    ...(org.groups != null ? { groups: [...org.groups] } : {}),
    ...(sets != null ? { permissions: actingPermissionSets(sets, org.entitySlug), permissioned: true } : {}),
  } as T
}

/** The request entity of an organization the provider claims — keyed by its frozen IAM key. */
export const resolvedEntityOf = (org: OidcOrganizationClaim): ResolvedEntity => ({
  id: org.entityKey, slug: org.entitySlug, iamKey: org.entityKey,
})

/** The switch's view of an organization: everything but the key. */
export const organizationItemOf = (org: OidcOrganizationClaim, acting?: string): OidcOrganizationItem => ({
  entitySlug: org.entitySlug,
  ...(org.title != null ? { title: org.title } : {}),
  owner: org.owner,
  ...(org.groups != null ? { groups: [...org.groups] } : {}),
  ...(org.home != null ? { home: org.home } : {}),
  acting: org.entityKey === acting,
})
