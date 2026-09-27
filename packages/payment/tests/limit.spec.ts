import { describe, expect, test } from 'bun:test'
import {
  LimitKind, LimitMisdeclared, LimitWindow, capabilityOf, formatLimitParam, hasLimitRoom, limitOf,
  parseLimitParam, windowBoundsOf, windowKeyOf,
} from '../src/index.js'
import type { EntitlementView, LimitView } from '../src/index.js'

const utc = (iso: string): Date => new Date(iso)

describe('window keys', () => {
  test('a day window rolls at UTC midnight', () => {
    expect(windowKeyOf(LimitKind.Window, LimitWindow.Day, utc('2026-01-31T23:59:59.999Z'))).toBe('2026-01-31')
    expect(windowKeyOf(LimitKind.Window, LimitWindow.Day, utc('2026-02-01T00:00:00.000Z'))).toBe('2026-02-01')
  })

  test('a month window rolls on the 1st, UTC, across a year', () => {
    expect(windowKeyOf(LimitKind.Window, LimitWindow.Month, utc('2026-12-31T23:59:59.999Z'))).toBe('2026-12')
    expect(windowKeyOf(LimitKind.Window, LimitWindow.Month, utc('2027-01-01T00:00:00.000Z'))).toBe('2027-01')
    // A local time zone ahead of UTC does not move the key.
    expect(windowKeyOf(LimitKind.Window, LimitWindow.Month, utc('2026-03-31T23:30:00-02:00'))).toBe('2026-04')
  })

  test('lifetime and occupancy never renew', () => {
    expect(windowKeyOf(LimitKind.Lifetime, undefined, utc('2026-01-01T00:00:00Z'))).toBe('lifetime')
    expect(windowKeyOf(LimitKind.Occupancy, LimitWindow.Day, utc('2030-06-15T12:00:00Z'))).toBe('occupancy')
  })

  test('a window limit without a window is a misdeclaration', () => {
    expect(() => windowKeyOf(LimitKind.Window, undefined)).toThrow(LimitMisdeclared)
  })
})

describe('window bounds', () => {
  test('a day spans [midnight, next midnight)', () => {
    const { start, resetsAt } = windowBoundsOf(LimitWindow.Day, utc('2026-01-31T13:00:00Z'))
    expect(start.toISOString()).toBe('2026-01-31T00:00:00.000Z')
    expect(resetsAt.toISOString()).toBe('2026-02-01T00:00:00.000Z')
  })

  test('a month spans [1st, next 1st) and resetsAt belongs to the next window', () => {
    const { start, resetsAt } = windowBoundsOf(LimitWindow.Month, utc('2026-12-31T23:59:59.999Z'))
    expect(start.toISOString()).toBe('2026-12-01T00:00:00.000Z')
    expect(resetsAt.toISOString()).toBe('2027-01-01T00:00:00.000Z')
    expect(windowKeyOf(LimitKind.Window, LimitWindow.Month, resetsAt)).toBe('2027-01')
  })
})

describe('limit parameters', () => {
  test('format and parse round-trip', () => {
    expect(formatLimitParam('seats')).toBe('limit:seats')
    expect(formatLimitParam('seats', 3)).toBe('limit:seats>=3')
    expect(parseLimitParam(formatLimitParam('seats'))).toEqual({ key: 'seats', atLeast: 1 })
    expect(parseLimitParam(formatLimitParam('seats', 3))).toEqual({ key: 'seats', atLeast: 3 })
  })

  test('a capability parameter, a bare key or an empty key is not a limit', () => {
    expect(parseLimitParam('feature:whitelabel')).toBeNull()
    expect(parseLimitParam('seats')).toBeNull()
    expect(parseLimitParam('limit:')).toBeNull()
    expect(parseLimitParam('')).toBeNull()
  })

  test('a floor that is not positive refuses rather than throwing', () => {
    expect(parseLimitParam('limit:seats>=0')).toBeNull()
    expect(() => parseLimitParam(undefined as unknown as string)).not.toThrow()
    expect(parseLimitParam(undefined as unknown as string)).toBeNull()
  })
})

const seats: LimitView = {
  key: 'seats', param: 'limit:seats', kind: LimitKind.Occupancy, limit: 3, used: 2, remaining: 1,
}

const view: EntitlementView = {
  plan: {
    sku: 'pro-monthly', productSku: 'pro', title: 'Pro', rank: 10, free: false,
    status: 'active' as EntitlementView['plan']['status'], paygate: 'stripe',
  },
  capabilities: [
    { param: 'feature:whitelabel', scope: 'feature', permission: 'whitelabel', value: true, granted: true },
    { param: 'feature:custom-domain', scope: 'feature', permission: 'custom-domain', value: true, granted: false },
  ],
  limits: [seats],
  at: new Date(),
}

describe('reading a view', () => {
  test('room is remaining against the floor', () => {
    expect(hasLimitRoom(seats)).toBe(true)
    expect(hasLimitRoom(seats, 2)).toBe(false)
    expect(hasLimitRoom(null)).toBe(false)
  })

  test('a limit is found by key', () => {
    expect(limitOf(view, 'seats')).toBe(seats)
    expect(limitOf(view, 'projects')).toBeNull()
    expect(limitOf(null, 'seats')).toBeNull()
  })

  test('a capability passes only while granted, and a limit parameter never does', () => {
    expect(capabilityOf(view, 'feature:whitelabel')).toBe(true)
    expect(capabilityOf(view, 'feature:custom-domain')).toBe(false)
    expect(capabilityOf(view, 'limit:seats')).toBe(false)
    expect(capabilityOf(null, 'feature:whitelabel')).toBe(false)
  })
})
