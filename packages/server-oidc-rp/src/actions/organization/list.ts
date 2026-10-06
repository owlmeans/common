import type { RefedEntrypointHandler } from '@owlmeans/server-entrypoint'
import { handleRequest } from '@owlmeans/server-api'
import type { OidcOrganizationList } from '@owlmeans/oidc'
import { assertContext } from '@owlmeans/context'
import type { Config, Context } from '../../types.js'
import { oidcCacheOf } from '../../utils/cache.js'
import { oidcOrganizationHelper } from '../../utils/organization.js'

/**
 * The organizations of the session's subject, the acting one marked; never their keys.
 *
 * Runs behind `OIDC_GUARD`, which has already validated — and, where the provider requires it,
 * refreshed — the session against the provider. So the record it reads holds the provider's current
 * organizations.
 */
export const listOrganizations: RefedEntrypointHandler = handleRequest(async (req, ctx): Promise<OidcOrganizationList> => {
  const context = assertContext<Config, Context>(ctx)
  const record = await oidcCacheOf(context).sessionOf(req)

  return {
    items: record.acting == null
      ? []
      : (record.organizations ?? []).map(org => oidcOrganizationHelper.organizationItemOf(org, record.acting)),
  }
})
