import { describe, expect, test } from 'bun:test'
import { extractPermissionSets } from '../src/utils/permissions.js'

describe('@owlmeans/server-oidc-rp — extractPermissionSets', () => {
  test('keeps an empty granted permissions claim distinct from a missing claim', () => {
    expect(extractPermissionSets([])).toEqual([])
    expect(extractPermissionSets(undefined)).toBeUndefined()
  })
})
