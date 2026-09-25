import { describe, expect, test } from 'bun:test'
import { AuthForbidden } from '@owlmeans/auth'
import { ResilientError } from '@owlmeans/error'
import { SUPPORTED_LNGS } from '@owlmeans/i18n'
import * as payment from '../src/index.js'
import {
  BillingCountryLocked, CancellationUnavailable, CapabilityRequired, CheckoutLimitExceeded, ConsentKind,
  consentRefusalOf, ConsumerRightsError, ConsumerRightsRefusal, EntitlementRefusal, LimitExhausted, LimitMisdeclared,
  LimitUnknown, PerformanceConsentRequired, PlanRequired, PortalUnavailable, SubscriptionStartRequired,
  WebhookSetupError, WithdrawalUnavailable, WithdrawalUnavailableReason,
} from '../src/index.js'

/** The canonical set plus French, which this package ships and registers too. */
const LANGUAGES = [...SUPPORTED_LNGS, 'fr'] as const

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
    for (const lng of LANGUAGES) {
      const messages = await load(lng)
      expect(Object.keys(messages).sort()).toEqual(Object.keys(en).sort())
      expect(Object.values(messages).every(message => message.trim() !== '')).toBe(true)
    }
  })

  test('no message calls anything non-refundable', async () => {
    for (const lng of LANGUAGES) {
      const messages = Object.values(await load(lng)).join('\n')
      expect(messages).not.toMatch(/non[-\s]?refundable|nicht\s+erstattungsf|non\s+rembours|bezzwrotn|no\s+reembolsable|невозвратн|неповоротн|незваротн/i)
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

describe('consumer-rights refusals', () => {
  const statusOf = (error: Error): unknown => (error.constructor as { httpStatus?: unknown }).httpStatus
  const deadline = new Date('2026-10-09T00:00:00.000Z')
  const resetsAt = new Date('2026-09-30T12:00:00.000Z')

  test('declare 428 and 409 and are never forbidden; the fault declares nothing', () => {
    expect(statusOf(new PerformanceConsentRequired({ pending: 1 }))).toBe(428)
    expect(statusOf(new SubscriptionStartRequired('pro-monthly'))).toBe(428)
    expect(statusOf(new BillingCountryLocked({ country: 'PL' }))).toBe(409)
    expect(statusOf(new WithdrawalUnavailable(WithdrawalUnavailableReason.Expired))).toBe(409)
    expect(statusOf(new CancellationUnavailable('no-subscription'))).toBe(409)
    expect(statusOf(new CheckoutLimitExceeded({ reason: 'window', maximumMinor: 0, currency: 'usd' }))).toBe(409)
    expect(statusOf(new ConsumerRightsError('policy:links'))).toBeUndefined()
    for (const error of [
      new PerformanceConsentRequired({ pending: 1 }), new SubscriptionStartRequired('x'), new BillingCountryLocked({ country: 'PL' }),
      new WithdrawalUnavailable('expired'), new CancellationUnavailable('ended'),
      new CheckoutLimitExceeded({ reason: 'x', maximumMinor: 1, currency: 'usd' }),
    ]) {
      expect(error).not.toBeInstanceOf(AuthForbidden)
    }
    expect(new PerformanceConsentRequired({ pending: 1 })).toBeInstanceOf(ConsumerRightsRefusal)
    expect(new CheckoutLimitExceeded({ reason: 'x', maximumMinor: 1, currency: 'usd' })).not.toBeInstanceOf(ConsumerRightsError)
  })

  test('keep their fields across a marshal, with markers the wire can match', () => {
    const consent = new PerformanceConsentRequired({ pending: 2, deadline })
    expect(consent.message).toBe('payment:consumer-rights:performance-consent-required:2:2026-10-09T00:00:00.000Z')
    const consentBack = roundTrip(consent) as PerformanceConsentRequired
    expect(consentBack).toBeInstanceOf(PerformanceConsentRequired)
    expect(consentBack).toMatchObject({ pending: 2, deadline })
    expect(statusOf(consentBack)).toBe(428)
    expect((roundTrip(new PerformanceConsentRequired({ pending: 1 })) as PerformanceConsentRequired).deadline).toBeUndefined()

    const start = roundTrip(new SubscriptionStartRequired('pro:monthly/eu')) as SubscriptionStartRequired
    expect(start.message).toBe('payment:consumer-rights:subscription-start-required:pro%3Amonthly%2Feu')
    expect(start.planSku).toBe('pro:monthly/eu')

    expect(roundTrip(new BillingCountryLocked({ country: 'PL', requested: 'DE' }))).toMatchObject({ country: 'PL', requested: 'DE' })
    expect(roundTrip(new BillingCountryLocked({ country: 'PL' }))).toMatchObject({ country: 'PL', requested: undefined })
    expect(roundTrip(new WithdrawalUnavailable('performed'))).toMatchObject({ reason: 'performed' })
    expect(roundTrip(new CancellationUnavailable('no-subscription'))).toMatchObject({ reason: 'no-subscription' })

    const limit = new CheckoutLimitExceeded({ reason: 'window:7d', maximumMinor: 2500, currency: 'USD', resetsAt })
    expect(limit.message).toBe('payment:checkout-limit-exceeded:window%3A7d:2500:usd:2026-09-30T12:00:00.000Z')
    expect(roundTrip(limit)).toMatchObject({ reason: 'window:7d', maximumMinor: 2500, currency: 'usd', resetsAt })
  })

  test('consentRefusalOf reads the class, a marshaled error, or a marker', () => {
    expect(consentRefusalOf(new PerformanceConsentRequired({ pending: 1 }))).toBe(ConsentKind.Performance)
    expect(consentRefusalOf(new SubscriptionStartRequired('pro-monthly'))).toBe(ConsentKind.SubscriptionStart)
    expect(consentRefusalOf(ResilientError.marshal(new PerformanceConsentRequired({ pending: 3 })))).toBe(ConsentKind.Performance)
    expect(consentRefusalOf({ type: PerformanceConsentRequired.typeName, message: 'x' })).toBe(ConsentKind.Performance)
    expect(consentRefusalOf(new Error('upstream: subscription-start-required:pro'))).toBe(ConsentKind.SubscriptionStart)
    expect(consentRefusalOf(new BillingCountryLocked({ country: 'PL' }))).toBeNull()
    expect(consentRefusalOf(new Error('plain'))).toBeNull()
    expect(consentRefusalOf(null)).toBeNull()
    expect(consentRefusalOf('performance-consent-required')).toBeNull()
  })
})
