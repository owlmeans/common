import type { RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import { handleBody, handleRequest } from '@owlmeans/server-api'
import type { AbstractRequest } from '@owlmeans/entrypoint'
import type { AuthToken } from '@owlmeans/auth'
import { AuthForbidden, AuthorizationError } from '@owlmeans/auth'
import type { OidcOrganizationList, OidcOrganizationSwitch } from '@owlmeans/oidc'
import { ORGANIZATION_REFUSAL } from '@owlmeans/oidc'
import { assertContext } from '@owlmeans/context'
import type { Config, Context } from '../types.js'
import { cache, sessionRecord, sessionTtl } from '../utils/cache.js'
import { signWrapped } from '../utils/wrapped.js'
import { actingAuth, organizationItemOf, resolvedEntityOf } from '../utils/organization.js'

/**
 * Both handlers run behind `OIDC_GUARD`, which has already validated — and, where the provider
 * requires it, refreshed — the session against the provider. So the record they read holds the
 * provider's current organizations, and a person removed from one cannot switch into it.
 */
const sessionOf = async (context: Context, req: AbstractRequest) => {
  if (req.auth == null) {
    throw new AuthorizationError('auth')
  }

  return sessionRecord(context, req.auth.token)
}

/** The organizations of the session's subject, the acting one marked; never their keys. */
export const listOrganizations: RefedEntrypointHandler = handleRequest(async (req, ctx): Promise<OidcOrganizationList> => {
  const context = assertContext<Config, Context>(ctx)
  const record = await sessionOf(context, req)

  return {
    items: record.acting == null ? [] : (record.organizations ?? []).map(org => organizationItemOf(org, record.acting)),
  }
})

/**
 * Moves the session into another organization of its subject and answers the re-signed token.
 *
 * The session record is the authority, not the browser: the organization must be one the provider
 * claimed, and a session whose provider claims none (a client without the organizations scope)
 * has nothing to switch to.
 */
export const switchOrganization: RefedEntrypointHandler = handleBody(async (
  body: OidcOrganizationSwitch, ctx, req
): Promise<AuthToken> => {
  const context = assertContext<Config, Context>(ctx)
  const record = await sessionOf(context, req)

  const org = record.acting != null
    ? record.organizations?.find(org => org.entitySlug === body.entitySlug)
    : undefined
  if (org == null) {
    throw new AuthForbidden(ORGANIZATION_REFUSAL)
  }

  const token = await signWrapped(context, actingAuth({ ...req.auth!, createdAt: new Date() }, org, record.sets))

  record.acting = org.entityKey
  record.entity = resolvedEntityOf(org)
  await cache(context).save(record, { ttl: sessionTtl(record.expiresAt) })

  return { token }
})
