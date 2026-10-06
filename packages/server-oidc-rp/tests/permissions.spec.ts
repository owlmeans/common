import { describe, expect, test } from 'bun:test'
import { AuthRole } from '@owlmeans/auth'
import type { Auth } from '@owlmeans/auth'
import type { OidcOrganizationClaim, OidcPermissionSetClaim } from '@owlmeans/oidc'
import { extractPermissionSets } from '../src/utils/permissions.js'
import { oidcOrganizationHelper } from '../src/utils/organization.js'

const {
  actingAuth, actingPermissionSets, extractOrganizations, organizationItemOf, pickOrganization, resolvedEntityOf,
} = oidcOrganizationHelper

const UNBOUND: OidcPermissionSetClaim = { scope: 'app', permissions: { 'report--view': true } }
const ACME: OidcPermissionSetClaim = { scope: 'app', permissions: { 'order--edit': true }, entitySlug: 'acme' }
const BETA: OidcPermissionSetClaim = { scope: 'app', permissions: { 'order--delete': true }, entitySlug: 'beta', resources: ['o-1'] }

const acme: OidcOrganizationClaim = { entitySlug: 'acme', entityKey: 'acme-key', owner: true, groups: ['admins'] }
const beta: OidcOrganizationClaim = { entitySlug: 'beta', entityKey: 'beta-key', owner: false, home: true }
const gamma: OidcOrganizationClaim = { entitySlug: 'gamma', entityKey: 'gamma-key', owner: false, title: 'Gamma' }

describe('@owlmeans/server-oidc-rp — extractPermissionSets', () => {
  test('keeps an empty granted permissions claim distinct from a missing claim', () => {
    expect(extractPermissionSets([])).toEqual([])
    expect(extractPermissionSets(undefined)).toBeUndefined()
  })

  test('keeps the organization a set is bound to', () => {
    expect(extractPermissionSets([UNBOUND, ACME])).toEqual([UNBOUND, ACME])
  })

  test('drops a set whose binding is not a slug', () => {
    expect(extractPermissionSets([UNBOUND, { ...ACME, entitySlug: 42 }])).toEqual([UNBOUND])
  })
})

describe('@owlmeans/server-oidc-rp — actingPermissionSets', () => {
  const sets = [UNBOUND, ACME, BETA]
  const strip = ({ entitySlug: _, ...set }: OidcPermissionSetClaim) => set

  test.each([
    ['no acting organization keeps only the unbound sets', undefined, [UNBOUND]],
    ['the acting organization adds its own sets, unbound', 'acme', [UNBOUND, strip(ACME)]],
    ['another acting organization sees only its own', 'beta', [UNBOUND, strip(BETA)]],
    ['an organization with no bound sets sees the unbound ones', 'gamma', [UNBOUND]],
  ] as const)('%s', (_, acting, expected) => {
    const result = actingPermissionSets(sets, acting)
    expect(result).toEqual([...expected])
    expect(result.some(set => 'entitySlug' in set)).toBe(false)
  })

  test('an empty claim stays empty', () => {
    expect(actingPermissionSets([], 'acme')).toEqual([])
  })
})

describe('@owlmeans/server-oidc-rp — extractOrganizations', () => {
  test('a missing claim is not an empty one', () => {
    expect(extractOrganizations(undefined)).toBeUndefined()
    expect(extractOrganizations({})).toBeUndefined()
    expect(extractOrganizations([])).toEqual([])
  })

  test('drops an entry that lacks either name or carries a malformed field', () => {
    expect(extractOrganizations([
      acme,
      { entitySlug: 'nokey', owner: false },
      { entityKey: 'noslug', owner: false },
      { entitySlug: 'bad', entityKey: 'bad-key', owner: 'yes' },
      { entitySlug: 'bad', entityKey: 'bad-key', owner: false, groups: [1] },
      beta,
    ])).toEqual([acme, beta])
  })
})

describe('@owlmeans/server-oidc-rp — pickOrganization', () => {
  const orgs = [acme, beta, gamma]

  test.each([
    ['sign-in: a requested member organization', { entitySlug: 'gamma' }, gamma],
    ['sign-in: a requested organization the subject is not in falls back to home', { entitySlug: 'other' }, beta],
    ['sign-in: nothing requested starts at home', {}, beta],
    ['running session: the acting key, nothing else', { entityKey: 'acme-key' }, acme],
    ['running session: the key wins over a requested slug', { entityKey: 'acme-key', entitySlug: 'gamma' }, acme],
    ['running session: a key the subject left is gone', { entityKey: 'other-key' }, undefined],
  ] as const)('%s', (_, selector, expected) => {
    expect(pickOrganization(orgs, selector)).toEqual(expected)
  })

  test('sign-in without a home organization starts at the first one', () => {
    expect(pickOrganization([gamma, acme])).toEqual(gamma)
  })

  test('nothing to pick from is nothing picked', () => {
    expect(pickOrganization([], { entitySlug: 'acme' })).toBeUndefined()
  })
})

describe('@owlmeans/server-oidc-rp — the acting organization on the wire', () => {
  test('the request entity is keyed by the frozen key', () => {
    expect(resolvedEntityOf(acme)).toEqual({ id: 'acme-key', slug: 'acme', iamKey: 'acme-key' })
  })

  test('the switch view never carries the key', () => {
    expect(organizationItemOf(acme, 'acme-key'))
      .toEqual({ entitySlug: 'acme', owner: true, groups: ['admins'], acting: true })
    expect(organizationItemOf(gamma, 'acme-key'))
      .toEqual({ entitySlug: 'gamma', title: 'Gamma', owner: false, acting: false })
  })

  test('the token keeps nothing of the organization acted in before', () => {
    const before = {
      token: 't', type: 'oidc', userId: 'sub', role: AuthRole.Guest, scopes: [], isUser: true,
      createdAt: new Date(), entitySlug: 'acme', groups: ['admins'], permissions: [UNBOUND], permissioned: true,
    } as Auth

    const inBeta = actingAuth(before, beta, [UNBOUND, ACME, BETA])
    expect(inBeta.entitySlug).toBe('beta')
    expect(inBeta.groups).toBeUndefined()
    expect(inBeta.permissions).toEqual([UNBOUND, { scope: 'app', permissions: { 'order--delete': true }, resources: ['o-1'] }])

    const withoutClaim = actingAuth(before, gamma)
    expect(withoutClaim.permissions).toBeUndefined()
    expect(withoutClaim.permissioned).toBeUndefined()
  })
})
