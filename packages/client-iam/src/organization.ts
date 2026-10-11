import { memoHelper, type BasicContext } from '@owlmeans/context'
import { oidcProtocols } from '@owlmeans/oidc'
import type { OidcOrganizationItem } from '@owlmeans/oidc'
import { adoptToken } from '@owlmeans/client-auth/login'
import type { OrganizationSwitchHelper } from './organization/types.js'

export const makeOrganizationSwitchHelper = (ctx: BasicContext<any>): OrganizationSwitchHelper => {
  const listOrganizations = async (): Promise<OidcOrganizationItem[]> =>
    (await ctx.entrypoint(oidcProtocols.organizations).call()).items

  const switchOrganization = async (entitySlug: string): Promise<void> => {
    const { token } = await ctx.entrypoint(oidcProtocols.organization).call({ body: { entitySlug } })

    await adoptToken(ctx, token)
  }

  return { listOrganizations, switchOrganization }
}

/** The organization switch of a context — one per context. */
export const organizationSwitchOf = memoHelper.oncePer(makeOrganizationSwitchHelper)

/** @deprecated compat:factory-refactor — use `organizationSwitchOf(ctx).listOrganizations()` */
export const listOrganizations = async (ctx: BasicContext<any>): Promise<OidcOrganizationItem[]> =>
  await organizationSwitchOf(ctx).listOrganizations()

/** @deprecated compat:factory-refactor — use `organizationSwitchOf(ctx).switchOrganization(…)` */
export const switchOrganization = async (ctx: BasicContext<any>, entitySlug: string): Promise<void> =>
  await organizationSwitchOf(ctx).switchOrganization(entitySlug)
