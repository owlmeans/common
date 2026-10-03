import { describe, expect, test } from 'bun:test'
import { RouteMethod } from '@owlmeans/route'
import { oidcProtocols } from '../src/entrypoints.js'
import { DISPATCHER_OIDC_ORGANIZATION, DISPATCHER_OIDC_ORGANIZATIONS, OIDC_GUARD } from '../src/consts.js'
import { OidcOrganizationSwitchSchema } from '../src/models.js'

describe('oidcProtocols — organization switch', () => {
  test('lists organizations on GET, behind the wrapped-token guard alone', () => {
    const { organizations } = oidcProtocols
    expect(organizations.alias).toBe(DISPATCHER_OIDC_ORGANIZATIONS)
    expect(organizations.route.route.path).toBe('/authenticate/oidc/organizations')
    expect(organizations.route.route.method).toBe(RouteMethod.GET)
    expect(organizations.guards).toEqual([OIDC_GUARD])
  })

  test('switches on POST with a closed slug body, behind the same guard', () => {
    const { organization } = oidcProtocols
    expect(organization.alias).toBe(DISPATCHER_OIDC_ORGANIZATION)
    expect(organization.route.route.path).toBe('/authenticate/oidc/organization')
    expect(organization.route.route.method).toBe(RouteMethod.POST)
    expect(organization.guards).toEqual([OIDC_GUARD])
    expect(organization.contract?.requestSchemas.body).toEqual(OidcOrganizationSwitchSchema)
  })

  test('the sign-in pair stays unguarded', () => {
    expect(oidcProtocols.init.guards).toEqual([])
    expect(oidcProtocols.authenticate.guards).toEqual([])
  })
})
