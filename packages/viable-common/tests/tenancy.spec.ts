import { describe, expect, test } from 'bun:test'
import { NO_TENANCY, ProjectArea, tenancyHelper } from '../src/index.js'
import { LandingGatePreference } from '../src/blueprint/index.js'

const experience = (tenancy: unknown) =>
  ({ experience: { landingGate: LandingGatePreference.Allow, tenancy: tenancy as never } })

describe('viable-common - the project tenancy', () => {
  test('NO_TENANCY is both flags off and cannot be changed', () => {
    expect(NO_TENANCY).toEqual({ operators: false, users: false })
    expect(Object.isFrozen(NO_TENANCY)).toBe(true)
  })

  test('tenancyOf answers NO_TENANCY for no blueprint, no layer, no key and an unreadable value', () => {
    expect(tenancyHelper.tenancyOf()).toBe(NO_TENANCY)
    expect(tenancyHelper.tenancyOf(null)).toBe(NO_TENANCY)
    expect(tenancyHelper.tenancyOf({})).toBe(NO_TENANCY)
    expect(tenancyHelper.tenancyOf({ experience: { landingGate: LandingGatePreference.Allow } })).toBe(NO_TENANCY)
    expect(tenancyHelper.tenancyOf(experience(null))).toBe(NO_TENANCY)
    expect(tenancyHelper.tenancyOf(experience('both'))).toBe(NO_TENANCY)
    expect(tenancyHelper.tenancyOf(experience({ operators: 'yes', users: 1 }))).toBe(NO_TENANCY)
    expect(tenancyHelper.tenancyOf(experience({ operators: false, users: false }))).toBe(NO_TENANCY)
    expect(tenancyHelper.tenancyOf({ experience: 'flat' as never })).toBe(NO_TENANCY)
  })

  test('tenancyOf reads a literal true per flag, and an absent flag as off', () => {
    expect(tenancyHelper.tenancyOf(experience({ operators: true, users: false }))).toEqual({ operators: true, users: false })
    expect(tenancyHelper.tenancyOf(experience({ users: true }))).toEqual({ operators: false, users: true })
    const both = tenancyHelper.tenancyOf(experience({ operators: true, users: true }))
    expect(both).toEqual({ operators: true, users: true })
    expect(Object.isFrozen(both)).toBe(true)
  })

  test('tenantedArea: user follows users, operator follows operators, guest and admin never', () => {
    const all = { operators: true, users: true }
    expect(tenancyHelper.tenantedArea(ProjectArea.User, all)).toBe(true)
    expect(tenancyHelper.tenantedArea(ProjectArea.Operator, all)).toBe(true)
    expect(tenancyHelper.tenantedArea(ProjectArea.Guest, all)).toBe(false)
    expect(tenancyHelper.tenantedArea(ProjectArea.Admin, all)).toBe(false)

    expect(tenancyHelper.tenantedArea(ProjectArea.User, { operators: true, users: false })).toBe(false)
    expect(tenancyHelper.tenantedArea(ProjectArea.Operator, { operators: false, users: true })).toBe(false)
    for (const area of Object.values(ProjectArea)) {
      expect(tenancyHelper.tenantedArea(area, NO_TENANCY)).toBe(false)
    }
    expect(tenancyHelper.tenantedArea('partner' as ProjectArea, all)).toBe(false)
  })
})
