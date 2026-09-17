import { describe, expect, test } from 'bun:test'
import { AuthForbidden } from '@owlmeans/auth'
import { ResilientError } from '@owlmeans/error'
import { SUPPORTED_LNGS } from '@owlmeans/i18n'
import * as payment from '../src/index.js'
import {
  CapabilityRequired, EntitlementRefusal, LimitExhausted, LimitMisdeclared, LimitUnknown, PlanRequired,
  PortalUnavailable, WebhookSetupError,
} from '../src/index.js'

const roundTrip = <T extends ResilientError>(error: T): ResilientError =>
  ResilientError.ensure(ResilientError.marshal(error))

describe('refusals', () => {
  test('are forbidden, so an HTTP boundary answers 403', () => {
    expect(new CapabilityRequired('feature:whitelabel')).toBeInstanceOf(AuthForbidden)
    expect(new LimitExhausted({ key: 'seats', used: 3, limit: 3 })).toBeInstanceOf(EntitlementRefusal)
    expect(new LimitUnknown('seats')).not.toBeInstanceOf(AuthForbidden)
  })

  test('a capability refusal keeps its parameters across a marshal', () => {
    const error = new CapabilityRequired(['feature:whitelabel', 'feature:custom-domain'])
    expect(error.message).toContain('capability-required:feature:whitelabel|feature:custom-domain')

    const back = roundTrip(error)
    expect(back).toBeInstanceOf(CapabilityRequired)
    expect(back.type).toBe(CapabilityRequired.typeName)
    expect((back as CapabilityRequired).params).toEqual(['feature:whitelabel', 'feature:custom-domain'])
  })

  test('a limit refusal keeps its key, counts and reset across a marshal', () => {
    const resetsAt = new Date('2026-10-01T00:00:00.000Z')
    const error = new LimitExhausted({ key: 'seats', used: 3, limit: 3, resetsAt })
    expect(error.message).toContain('limit-exhausted:seats:3/3:2026-10-01T00:00:00.000Z')

    const back = roundTrip(error) as LimitExhausted
    expect(back).toBeInstanceOf(LimitExhausted)
    expect(back).toMatchObject({ limitKey: 'seats', used: 3, limit: 3, resetsAt })
  })

  test('a limit that never renews marshals without a reset', () => {
    const back = roundTrip(new LimitExhausted({ key: 'imports', used: 1, limit: 1 })) as LimitExhausted
    expect(back).toMatchObject({ limitKey: 'imports', used: 1, limit: 1 })
    expect(back.resetsAt).toBeUndefined()
    expect(roundTrip(new PortalUnavailable('customer'))).toBeInstanceOf(PortalUnavailable)
  })
})

describe('declared HTTP status', () => {
  const statusOf = (error: Error): unknown => (error.constructor as { httpStatus?: unknown }).httpStatus

  test('a portal with nothing to act on is a conflict, and stays one across a marshal', () => {
    expect(statusOf(new PortalUnavailable('subscription'))).toBe(409)
    expect(statusOf(roundTrip(new PortalUnavailable('customer')))).toBe(409)
  })

  test('faults declare nothing, so an HTTP boundary answers 500', () => {
    for (const error of [
      new LimitUnknown('seats'), new LimitMisdeclared('seats'), new PlanRequired('x'), new WebhookSetupError('x'),
    ]) {
      expect(statusOf(error)).toBeUndefined()
    }
  })

  test('refusals declare nothing either — they are AuthForbidden, which a boundary answers 403', () => {
    expect(statusOf(new CapabilityRequired('feature:whitelabel'))).toBeUndefined()
    expect(new LimitExhausted({ key: 'seats', used: 1, limit: 1 })).toBeInstanceOf(AuthForbidden)
  })
})

const errorClasses = Object.values(payment as Record<string, unknown>).filter(
  (value): value is { typeName: string } =>
    typeof value === 'function' && value.prototype instanceof ResilientError,
)

describe('error messages', () => {
  const load = async (lng: string): Promise<Record<string, string>> =>
    (await import(`../src/i18n/errors/${lng}.json`, { with: { type: 'json' } })).default

  test('every language carries the same non-empty keys', async () => {
    const en = await load('en')
    for (const lng of SUPPORTED_LNGS) {
      const messages = await load(lng)
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort())
      expect(Object.values(messages).every(message => message.trim() !== '')).toBe(true)
    }
  })

  test('every error type of the package has a message', async () => {
    const en = await load('en')
    expect(errorClasses.length).toBeGreaterThan(10)
    for (const errorClass of errorClasses) {
      expect(en).toHaveProperty([errorClass.typeName])
    }
  })
})
