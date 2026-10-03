import { describe, expect, test } from 'bun:test'
import { hasPermission, IamUnsupported, unsupportedFacet } from '@owlmeans/iam'
import type { IamSubjectFacet } from '@owlmeans/iam'
import type { Authorization } from '@owlmeans/auth'
import type { OidcPermissionSetClaim } from '@owlmeans/oidc'

const auth: Authorization = {
  scopes: [],
  permissions: [
    // unscoped (project-wide) grant — shared set per client
    { scope: 'my-project', permissions: { 'article--modify': true } },
    // resource-scoped grant — dedicated set carrying its resource ids
    {
      scope: 'my-project',
      title: 'department--modify',
      permissions: { 'department--modify': true },
      resources: ['dep-12345678']
    }
  ]
}

describe('@owlmeans/iam — hasPermission', () => {
  test('grants an unscoped permission', () => {
    expect(hasPermission(auth, 'article--modify')).toBe(true)
    expect(hasPermission(auth, 'article--delete')).toBe(false)
  })

  test('grants a resource-scoped permission only for listed resource ids', () => {
    expect(hasPermission(auth, 'department--modify', { resourceId: 'dep-12345678' })).toBe(true)
    expect(hasPermission(auth, 'department--modify', { resourceId: 'dep-87654321' })).toBe(false)
  })

  test('an unscoped set satisfies a resourceId check (project-wide grant covers every resource)', () => {
    expect(hasPermission(auth, 'article--modify', { resourceId: 'art-12345678' })).toBe(true)
  })

  test('scope option restricts the check to one client', () => {
    expect(hasPermission(auth, 'article--modify', { scope: 'my-project' })).toBe(true)
    expect(hasPermission(auth, 'article--modify', { scope: 'other-project' })).toBe(false)
  })
})

describe('@owlmeans/iam — hasPermission and the acting organization', () => {
  const sets: OidcPermissionSetClaim[] = [
    { scope: 'my-project', permissions: { 'report--view': true } },
    { scope: 'my-project', permissions: { 'order--edit': true }, entitySlug: 'acme' },
    {
      scope: 'my-project', title: 'order--delete', permissions: { 'order--delete': true },
      resources: ['ord-1'], entitySlug: 'acme',
    },
  ]
  const bound: Authorization = { scopes: [], permissions: sets }

  test.each([
    ['an unbound set applies with no organization named', 'report--view', {}, true],
    ['an unbound set applies in any organization', 'report--view', { entitySlug: 'beta' }, true],
    ['a bound set applies in its organization', 'order--edit', { entitySlug: 'acme' }, true],
    ['a bound set does not apply in another organization', 'order--edit', { entitySlug: 'beta' }, false],
    // Fail-closed: a bound set that leaked into a token must not count where the caller named none.
    ['a bound set does not apply when no organization is named', 'order--edit', {}, false],
    ['bound and resource-scoped: both checks pass', 'order--delete', { entitySlug: 'acme', resourceId: 'ord-1' }, true],
    ['bound and resource-scoped: wrong record', 'order--delete', { entitySlug: 'acme', resourceId: 'ord-2' }, false],
    ['bound and resource-scoped: wrong organization', 'order--delete', { entitySlug: 'beta', resourceId: 'ord-1' }, false],
  ] as const)('%s', (_, permission, opts, expected) => {
    expect(hasPermission(bound, permission, opts)).toBe(expected)
  })
})

describe('@owlmeans/iam — unsupportedFacet', () => {
  const facet = unsupportedFacet<IamSubjectFacet>('subjects')

  test('every method throws IamUnsupported naming the facet', () => {
    expect(() => facet.identify('client', 'account')).toThrow(IamUnsupported)
    expect(() => facet.resolve('client', 'account')).toThrow('iam:unsupported:subjects')
  })

  test('an awaited call rejects the same way', async () => {
    const attempt = async () => await facet.signIn('client', { email: 'a@example.test' })
    expect(attempt()).rejects.toBeInstanceOf(IamUnsupported)
  })

  test('is not a thenable, so awaiting the facet itself does not throw', async () => {
    expect(await Promise.resolve(facet)).toBe(facet)
  })
})
