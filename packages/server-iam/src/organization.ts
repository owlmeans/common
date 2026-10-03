import { AuthForbidden, AuthorizationError } from '@owlmeans/auth'
import type { AbstractRequest, ResolvedEntity } from '@owlmeans/entrypoint'
import { ORGANIZATION_REFUSAL } from '@owlmeans/oidc'
import type { OidcOrganizationClaim } from '@owlmeans/oidc'
import { resolvedEntityOf, sessionRecord } from '@owlmeans/server-oidc-rp'
import type { Config, Context, OIDCAuthCache } from '@owlmeans/server-oidc-rp'

/** The session record behind the request's wrapped token — the guard has already refreshed it. */
export const sessionOf = async <C extends Config, T extends Context<C>>(
  context: T, request: AbstractRequest
): Promise<OIDCAuthCache> => {
  if (request.auth == null) {
    throw new AuthorizationError('auth')
  }

  return sessionRecord<C, T>(context, request.auth.token)
}

/**
 * The organizations the provider last claimed for the session's subject. A session that acts in
 * none — a client without the organizations scope — has none to offer, whatever its record holds.
 */
const claimedOf = (record: OIDCAuthCache): OidcOrganizationClaim[] =>
  record.acting == null ? [] : record.organizations ?? []

/**
 * Every organization of the request's subject, as request entities keyed by their frozen IAM key.
 *
 * The session record is the authority — the provider's last claim, re-read on every validation —
 * never the browser: a relying party of a tenanted client has no organization registry of its own.
 */
export const organizationsOf = async <C extends Config, T extends Context<C>>(
  context: T, request: AbstractRequest
): Promise<ResolvedEntity[]> => claimedOf(await sessionOf<C, T>(context, request)).map(resolvedEntityOf)

/**
 * One organization of the request's subject by its slug — for a handler that acts in an
 * organization the URL names rather than in the session's acting one. One the subject is not in is
 * refused as `AuthForbidden(ORGANIZATION_REFUSAL)`, exactly as the switch refuses it.
 */
export const organizationOf = async <C extends Config, T extends Context<C>>(
  context: T, request: AbstractRequest, entitySlug: string
): Promise<ResolvedEntity> => {
  const org = claimedOf(await sessionOf<C, T>(context, request)).find(org => org.entitySlug === entitySlug)
  if (org == null) {
    throw new AuthForbidden(ORGANIZATION_REFUSAL)
  }

  return resolvedEntityOf(org)
}
