import type { RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import { handleBody } from '@owlmeans/server-api'
import type { AuthToken } from '@owlmeans/auth'
import { AuthForbidden } from '@owlmeans/auth'
import type { OidcOrganizationSwitch } from '@owlmeans/oidc'
import { ORGANIZATION_REFUSAL } from '@owlmeans/oidc'
import { assertContext } from '@owlmeans/context'
import type { Config, Context } from '../../types.js'
import { oidcCacheOf } from '../../utils/cache.js'
import { oidcWrappedOf } from '../../utils/wrapped.js'
import { oidcOrganizationHelper } from '../../utils/organization.js'

/**
 * Moves the session into another organization of its subject and answers the re-signed token.
 *
 * The session record is the authority, not the browser: the organization must be one the provider
 * claimed, and a session whose provider claims none (a client without the organizations scope)
 * has nothing to switch to. Runs behind `OIDC_GUARD`, which has already validated — and, where the
 * provider requires it, refreshed — the session against the provider, so a person removed from an
 * organization cannot switch into it.
 */
export const switchOrganization: RefedEntrypointHandler = handleBody(async (
  body: OidcOrganizationSwitch, ctx, req
): Promise<AuthToken> => {
  const context = assertContext<Config, Context>(ctx)
  const oidcCache = oidcCacheOf(context)
  const record = await oidcCache.sessionOf(req)

  const org = record.acting != null
    ? record.organizations?.find(org => org.entitySlug === body.entitySlug)
    : undefined
  if (org == null) {
    throw new AuthForbidden(ORGANIZATION_REFUSAL)
  }

  const token = await oidcWrappedOf(context).signWrapped(
    oidcOrganizationHelper.actingAuth({ ...req.auth!, createdAt: new Date() }, org, record.sets)
  )

  record.acting = org.entityKey
  record.entity = oidcOrganizationHelper.resolvedEntityOf(org)
  await oidcCache.resource().save(record, { ttl: oidcCache.sessionTtl(record.expiresAt) })

  return { token }
})
