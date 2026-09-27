import { describe, expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import { ApiStatusError } from '@owlmeans/api'
import { ConsentKind, PerformanceConsentRequired, SubscriptionStartRequired } from '@owlmeans/payment'
import {
  ConsentDeclined, consentRefusalKindOf, isConsentDeclined, isConsentRefusal, isPerformanceConsentRefusal,
} from '../src/consumer/refusal.js'

const INCIDENT = '0b6f8a3e-8f0e-4b9f-9c55-2f1f0f6f2a11'
const MARKER = 'payment:consumer-rights:performance-consent-required:1:2026-10-09T00:00:00.000Z'

describe('isConsentRefusal', () => {
  test('the class, fresh and rebuilt from its marshalled form', () => {
    const fresh = new PerformanceConsentRequired({ pending: 1, deadline: new Date('2026-10-09T00:00:00Z') })
    expect(isConsentRefusal(fresh)).toBe(true)
    expect(consentRefusalKindOf(fresh)).toBe(ConsentKind.Performance)

    const rebuilt = ResilientError.ensure(fresh.marshal())
    expect(isConsentRefusal(rebuilt)).toBe(true)
    expect(isPerformanceConsentRefusal(rebuilt)).toBe(true)
  })

  test('the marker in a message, in a type, and as a stored string', () => {
    expect(isConsentRefusal(new Error(MARKER))).toBe(true)
    expect(isConsentRefusal({ type: PerformanceConsentRequired.typeName, message: 'rebuilt elsewhere' })).toBe(true)
    expect(isConsentRefusal(MARKER)).toBe(true)
  })

  test('a bare 428 — a production incident body — by its status alone', () => {
    const bare = new ApiStatusError(428, INCIDENT)
    expect(isConsentRefusal(bare)).toBe(true)
    expect(consentRefusalKindOf(bare)).toBe('unknown')
    expect(isPerformanceConsentRefusal(bare)).toBe(true)

    // A development body keeps its class and gets the status stamped on it.
    const stamped = Object.assign(new Error('something else'), { responseStatus: 428 })
    expect(isConsentRefusal(stamped)).toBe(true)
    expect(isConsentRefusal(`api:client:status:428:${INCIDENT}`)).toBe(true)
  })

  test('wrapped: in a cause, in an error field, and in a planning commit failure', () => {
    expect(isConsentRefusal(new Error('the action failed', { cause: new ApiStatusError(428) }))).toBe(true)
    expect(isConsentRefusal({ message: 'job failed', error: { message: MARKER } })).toBe(true)
    // `CommitFailed` packs the refusal's text after its own marker.
    expect(consentRefusalKindOf(new Error(`planning:commit-failed:t1:${MARKER}`))).toBe(ConsentKind.Performance)
    // … or carries it as a string cause.
    expect(isConsentRefusal({ message: 'planning:commit-failed:t1', cause: `api:client:status:428:${INCIDENT}` })).toBe(true)
    expect(isConsentRefusal(new AggregateError([new Error('other'), new PerformanceConsentRequired({ pending: 2 })]))).toBe(true)
  })

  test('the subscription start is a consent refusal, but not the one the spend dialog answers', () => {
    const start = new SubscriptionStartRequired('pro-monthly')
    expect(isConsentRefusal(start)).toBe(true)
    expect(consentRefusalKindOf(start)).toBe(ConsentKind.SubscriptionStart)
    expect(isPerformanceConsentRefusal(start)).toBe(false)
  })

  test('anything else is not one — other statuses, plain failures, a decline, nothing at all', () => {
    expect(isConsentRefusal(new ApiStatusError(409, INCIDENT))).toBe(false)
    expect(isConsentRefusal(new ApiStatusError(402))).toBe(false)
    expect(isConsentRefusal(new Error('network down'))).toBe(false)
    expect(isConsentRefusal(new ConsentDeclined())).toBe(false)
    expect(isConsentRefusal(null)).toBe(false)
    expect(isConsentRefusal(undefined)).toBe(false)
    expect(isConsentRefusal('just text')).toBe(false)

    const loop: { message: string, cause?: unknown } = { message: 'loop' }
    loop.cause = loop
    expect(isConsentRefusal(loop)).toBe(false)
  })
})

describe('ConsentDeclined', () => {
  test('keeps its kind across a marshal and is told apart from a refusal', () => {
    const declined = new ConsentDeclined(ConsentKind.Performance)
    expect(isConsentDeclined(declined)).toBe(true)
    expect(declined.kind).toBe(ConsentKind.Performance)

    const rebuilt = ResilientError.ensure(declined.marshal())
    expect(rebuilt).toBeInstanceOf(ConsentDeclined)
    expect((rebuilt as ConsentDeclined).kind).toBe(ConsentKind.Performance)
  })
})
