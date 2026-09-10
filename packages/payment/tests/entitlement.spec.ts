import { describe, test, expect } from 'bun:test'
import {
  CAPABILITY_FEATURE_SCOPE, entitlementList, formatEntitlementParam, hasEntitlement,
  parseEntitlementParam,
} from '../src/entitlement.js'
import type { PermissionSet } from '@owlmeans/auth'

const pro: PermissionSet[] = [
  { scope: 'renewable', permissions: { production: 1, credits: 5000 } },
  { scope: CAPABILITY_FEATURE_SCOPE, permissions: { 'branding--whitelabel': true, 'domain--custom': true } },
]

describe('the parameter grammar', () => {
  test('a bare permission has no scope and no floor', () => {
    expect(parseEntitlementParam('domain--custom')).toEqual({ permission: 'domain--custom' })
  })

  test('a scope is everything before the first colon', () => {
    expect(parseEntitlementParam('feature:branding--whitelabel'))
      .toEqual({ scope: 'feature', permission: 'branding--whitelabel' })
  })

  test('a floor is parsed as a number', () => {
    expect(parseEntitlementParam('renewable:credits>=100'))
      .toEqual({ scope: 'renewable', permission: 'credits', atLeast: 100 })
  })

  test('formatting round-trips', () => {
    for (const param of ['domain--custom', 'feature:branding--whitelabel', 'renewable:credits>=100']) {
      expect(formatEntitlementParam(parseEntitlementParam(param))).toBe(param)
    }
  })
})

describe('the predicate', () => {
  test('a held feature passes', () => {
    expect(hasEntitlement(pro, 'feature:branding--whitelabel')).toBe(true)
  })

  test('a feature nobody granted does not', () => {
    expect(hasEntitlement(pro, 'feature:branding--nonexistent')).toBe(false)
  })

  test('a scope that does not match is not consulted', () => {
    expect(hasEntitlement(pro, 'renewable:branding--whitelabel')).toBe(false)
    // …and without a scope, any set may answer.
    expect(hasEntitlement(pro, 'branding--whitelabel')).toBe(true)
  })

  test('a numeric floor compares', () => {
    expect(hasEntitlement(pro, 'renewable:credits>=5000')).toBe(true)
    expect(hasEntitlement(pro, 'renewable:credits>=5001')).toBe(false)
  })

  test('a boolean cannot satisfy a numeric floor', () => {
    expect(hasEntitlement(pro, 'feature:branding--whitelabel>=1')).toBe(false)
  })

  test('an explicit false is not a grant', () => {
    expect(hasEntitlement([{ scope: 'feature', permissions: { x: false } }], 'feature:x')).toBe(false)
    expect(hasEntitlement([{ scope: 'feature', permissions: { x: null } }], 'feature:x')).toBe(false)
  })

  test('no capabilities at all is a refusal, never a pass', () => {
    expect(hasEntitlement(undefined, 'feature:branding--whitelabel')).toBe(false)
    expect(hasEntitlement([], 'feature:branding--whitelabel')).toBe(false)
  })

  test('a malformed parameter refuses rather than throwing', () => {
    // A gate that crashed on a typo would take down the endpoint it guards.
    expect(() => hasEntitlement(pro, '')).not.toThrow()
    expect(hasEntitlement(pro, '')).toBe(false)
    expect(hasEntitlement(pro, 'feature:')).toBe(false)
    expect(hasEntitlement(pro, 'renewable:credits>=abc')).toBe(true)
  })
})

describe('listing', () => {
  test('unions every granted capability, scoped', () => {
    expect(entitlementList(pro).sort()).toEqual([
      'feature:branding--whitelabel', 'feature:domain--custom',
      'renewable:credits', 'renewable:production',
    ])
  })

  test('skips what is not granted', () => {
    expect(entitlementList([{ scope: 'feature', permissions: { a: true, b: false, c: null } }]))
      .toEqual(['feature:a'])
  })
})
