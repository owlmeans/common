import { describe, expect, test } from 'bun:test'
import { hasPermission } from '@owlmeans/iam'
import type { Authorization } from '@owlmeans/auth'

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
