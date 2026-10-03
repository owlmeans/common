import type { BasicContext } from '@owlmeans/context'
import { oidcProtocols } from '@owlmeans/oidc'
import type { OidcOrganizationItem } from '@owlmeans/oidc'
import { adoptToken } from '@owlmeans/client-auth/login'

/**
 * The organizations of the signed-in subject, the one the session acts in marked `acting`.
 *
 * Answered by the application's own server from the session it holds — refreshed against the
 * provider by the guard first — so a person just removed from an organization no longer sees it.
 * A session of a client without the organizations scope has none. Needs the bindings of
 * `iamEntrypoints()`.
 */
export const listOrganizations = async (ctx: BasicContext<any>): Promise<OidcOrganizationItem[]> =>
  (await ctx.entrypoint(oidcProtocols.organizations).call()).items

/**
 * Moves the session into another organization of its subject and adopts the re-signed token, so
 * every request after it — and every screen reading `auth` — acts in that organization.
 *
 * There is no per-request organization selector: the session, not the request, decides where a
 * request acts. An organization the subject is not in is refused (`ORGANIZATION_REFUSAL`) and the
 * current token stays.
 */
export const switchOrganization = async (ctx: BasicContext<any>, entitySlug: string): Promise<void> => {
  const { token } = await ctx.entrypoint(oidcProtocols.organization).call({ body: { entitySlug } })

  await adoptToken(ctx, token)
}
