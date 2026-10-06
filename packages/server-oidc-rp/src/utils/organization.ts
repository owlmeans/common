import type { Auth, PermissionSet } from '@owlmeans/auth'
import type { ResolvedEntity } from '@owlmeans/entrypoint'
import type { OidcOrganizationClaim, OidcOrganizationItem, OidcPermissionSetClaim } from '@owlmeans/oidc'
import type { OrganizationSelector } from './types.js'
import type { OidcOrganizationHelper } from './organization/types.js'

export const createOidcOrganizationHelper = (): OidcOrganizationHelper => {
  const isOptionalString = (value: unknown): boolean => value == null || typeof value === 'string'

  const extractOrganizations = (claim: unknown): OidcOrganizationClaim[] | undefined => {
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

  const pickOrganization = (
    orgs: OidcOrganizationClaim[], selector: OrganizationSelector = {}
  ): OidcOrganizationClaim | undefined => {
    if (selector.entityKey != null) {
      return orgs.find(org => org.entityKey === selector.entityKey)
    }

    return (selector.entitySlug != null ? orgs.find(org => org.entitySlug === selector.entitySlug) : undefined)
      ?? orgs.find(org => org.home === true)
      ?? orgs[0]
  }

  const actingPermissionSets = (
    sets: OidcPermissionSetClaim[], entitySlug?: string
  ): PermissionSet[] => sets.flatMap(({ entitySlug: bound, ...set }) =>
    bound == null || (entitySlug != null && bound === entitySlug) ? [set] : []
  )

  const actingAuth = <T extends Auth>(user: T, org: OidcOrganizationClaim, sets?: OidcPermissionSetClaim[]): T => {
    const { groups: _groups, permissions: _permissions, permissioned: _permissioned, ...rest } = user

    return {
      ...rest,
      entitySlug: org.entitySlug,
      ...(org.groups != null ? { groups: [...org.groups] } : {}),
      ...(sets != null ? { permissions: actingPermissionSets(sets, org.entitySlug), permissioned: true } : {}),
    } as T
  }

  const resolvedEntityOf = (org: OidcOrganizationClaim): ResolvedEntity => ({
    id: org.entityKey, slug: org.entitySlug, iamKey: org.entityKey,
  })

  const organizationItemOf = (org: OidcOrganizationClaim, acting?: string): OidcOrganizationItem => ({
    entitySlug: org.entitySlug,
    ...(org.title != null ? { title: org.title } : {}),
    owner: org.owner,
    ...(org.groups != null ? { groups: [...org.groups] } : {}),
    ...(org.home != null ? { home: org.home } : {}),
    acting: org.entityKey === acting,
  })

  return {
    extractOrganizations, pickOrganization, actingPermissionSets, actingAuth, resolvedEntityOf, organizationItemOf,
  }
}

export const oidcOrganizationHelper = createOidcOrganizationHelper()

/** @deprecated compat:factory-refactor — use `oidcOrganizationHelper.pickOrganization(…)` */
export const pickOrganization = (
  orgs: OidcOrganizationClaim[], selector: OrganizationSelector = {}
): OidcOrganizationClaim | undefined => oidcOrganizationHelper.pickOrganization(orgs, selector)

/** @deprecated compat:factory-refactor — use `oidcOrganizationHelper.actingPermissionSets(…)` */
export const actingPermissionSets = (sets: OidcPermissionSetClaim[], entitySlug?: string): PermissionSet[] =>
  oidcOrganizationHelper.actingPermissionSets(sets, entitySlug)

/** @deprecated compat:factory-refactor — use `oidcOrganizationHelper.resolvedEntityOf(…)` */
export const resolvedEntityOf = (org: OidcOrganizationClaim): ResolvedEntity => oidcOrganizationHelper.resolvedEntityOf(org)
