import { AuthForbidden, AuthorizationError } from '@owlmeans/auth'
import type { AbstractRequest, ResolvedEntity } from '@owlmeans/entrypoint'
import { ORGANIZATION_REFUSAL } from '@owlmeans/oidc'
import type { OidcOrganizationClaim } from '@owlmeans/oidc'
import { resolvedEntityOf, sessionRecord } from '@owlmeans/server-oidc-rp'
import type { Config, Context, OIDCAuthCache } from '@owlmeans/server-oidc-rp'
import type { OrganizationScope } from './organization/types.js'

/**
 * The organizations the provider last claimed for the session's subject. A session that acts in
 * none — a client without the organizations scope — has none to offer, whatever its record holds.
 */
const claimedOf = (record: OIDCAuthCache): OidcOrganizationClaim[] =>
  record.acting == null ? [] : record.organizations ?? []

export const makeOrganizationScope = <C extends Config, T extends Context<C>>(
  context: T, request: AbstractRequest
): OrganizationScope => {
  const sessionOf = async (): Promise<OIDCAuthCache> => {
    if (request.auth == null) {
      throw new AuthorizationError('auth')
    }

    return sessionRecord<C, T>(context, request.auth.token)
  }

  const organizationsOf = async (): Promise<ResolvedEntity[]> => claimedOf(await sessionOf()).map(resolvedEntityOf)

  const organizationOf = async (entitySlug: string): Promise<ResolvedEntity> => {
    const org = claimedOf(await sessionOf()).find(org => org.entitySlug === entitySlug)
    if (org == null) {
      throw new AuthForbidden(ORGANIZATION_REFUSAL)
    }

    return resolvedEntityOf(org)
  }

  return { sessionOf, organizationsOf, organizationOf }
}

/** @deprecated compat:factory-refactor — use `makeOrganizationScope(context, request).organizationsOf()` */
export const organizationsOf = async <C extends Config, T extends Context<C>>(
  context: T, request: AbstractRequest
): Promise<ResolvedEntity[]> => await makeOrganizationScope<C, T>(context, request).organizationsOf()

/** @deprecated compat:factory-refactor — use `makeOrganizationScope(context, request).organizationOf(…)` */
export const organizationOf = async <C extends Config, T extends Context<C>>(
  context: T, request: AbstractRequest, entitySlug: string
): Promise<ResolvedEntity> => await makeOrganizationScope<C, T>(context, request).organizationOf(entitySlug)
