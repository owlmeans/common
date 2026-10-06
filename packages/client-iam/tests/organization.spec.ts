import { describe, expect, test } from 'bun:test'
import { AuthForbidden } from '@owlmeans/auth'
import { bind } from '@owlmeans/client-entrypoint'
import { makeClientContext } from '@owlmeans/client-context'
import type { ClientConfig } from '@owlmeans/client-context'
import { AppType, createService } from '@owlmeans/context'
import type { InitializedService } from '@owlmeans/context'
import { EntrypointOutcome, transportAlias } from '@owlmeans/entrypoint'
import type { AbstractRequest, AbstractResponse, EntrypointHandler, EntrypointTransport } from '@owlmeans/entrypoint'
import { ResilientError } from '@owlmeans/error'
import { DEFAULT_ALIAS as AUTH_SERVICE } from '@owlmeans/client-auth'
import { ORGANIZATION_REFUSAL, oidcProtocols } from '@owlmeans/oidc'
import type { OidcOrganizationItem } from '@owlmeans/oidc'
import { RouteProtocols } from '@owlmeans/route'
import { organizationSwitchOf } from '../src/organization.js'

/**
 * The organization switch from the browser's side. The relying party's server is stood in for by
 * the framework's own transport seam: a call reaches it with its alias and body, and a refusal
 * crosses as the marshalled text the API client unmarshals. The auth service records what it is
 * asked to adopt.
 */
const ITEMS: OidcOrganizationItem[] = [
  { entitySlug: 'acme', owner: true, home: true, acting: true },
  { entitySlug: 'beta', owner: false, title: 'Beta', acting: false },
]

const start = async () => {
  const calls: AbstractRequest[] = []
  const adopted: (string | undefined)[] = []

  const context = makeClientContext({
    ready: false, service: 'client-iam-tests', type: AppType.Frontend, layer: undefined, services: {}, webService: 'web',
  } as unknown as ClientConfig)

  context.registerService(createService<EntrypointTransport>(transportAlias(RouteProtocols.WEB), {
    protocol: RouteProtocols.WEB,
    handle: (async (req: AbstractRequest, res: AbstractResponse<unknown>) => {
      calls.push(req)
      if (req.alias === oidcProtocols.organizations.alias) {
        res.resolve({ items: ITEMS }, EntrypointOutcome.Ok)
        return
      }
      const { entitySlug } = req.body as { entitySlug: string }
      if (!ITEMS.some(item => item.entitySlug === entitySlug)) {
        res.reject(ResilientError.ensure(ResilientError.marshal(new AuthForbidden(ORGANIZATION_REFUSAL)).message, true))
        return
      }
      res.resolve({ token: `wrapped-token-for-${entitySlug}` }, EntrypointOutcome.Ok)
    }) as EntrypointHandler,
  }))
  context.registerService(createService<InitializedService & { update: (token?: string) => Promise<void> }>(AUTH_SERVICE, {
    update: async token => { adopted.push(token) },
  }))
  context.registerEntrypoint(bind(oidcProtocols.organizations))
  context.registerEntrypoint(bind(oidcProtocols.organization))
  await context.configure().init()

  return { context, calls, adopted }
}

describe('@owlmeans/client-iam — organizations', () => {
  test('listOrganizations answers the items of the session', async () => {
    const { context, calls } = await start()

    expect(await organizationSwitchOf(context).listOrganizations()).toEqual(ITEMS)
    expect(calls.map(call => call.alias)).toEqual([oidcProtocols.organizations.alias])
  })

  test('switchOrganization posts the slug and adopts the re-signed token', async () => {
    const { context, calls, adopted } = await start()

    await organizationSwitchOf(context).switchOrganization('beta')
    expect(calls[0].alias).toBe(oidcProtocols.organization.alias)
    expect(calls[0].body).toEqual({ entitySlug: 'beta' })
    expect(adopted).toEqual(['wrapped-token-for-beta'])
  })

  test('a refused switch adopts nothing', async () => {
    const { context, adopted } = await start()

    await expect(organizationSwitchOf(context).switchOrganization('gamma')).rejects.toBeInstanceOf(AuthForbidden)
    expect(adopted).toEqual([])
  })
})
