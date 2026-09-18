import { describe, expect, test } from 'bun:test'
import { emailThrottleKey, ipThrottleKey } from '../src/throttle.js'
import { otpEmailKey } from '../src/service.js'

describe('@owlmeans/server-auth-otp — privacy-preserving keys', () => {
  test('normalizes email case without storing the raw address', () => {
    const lower = emailThrottleKey('person@example.com')
    expect(emailThrottleKey(' PERSON@EXAMPLE.COM ')).toBe(lower)
    expect(lower).not.toContain('person')
    expect(otpEmailKey('person@example.com')).not.toContain('person')
  })

  test('does not collapse punctuation the old lossy key strategy discarded', () => {
    expect(emailThrottleKey('a+b@example.com')).not.toBe(emailThrottleKey('a_b@example.com'))
  })

  test('namespaces IP and email digests independently and keeps the IP non-raw', () => {
    const ip = ipThrottleKey('203.0.113.7')
    expect(ip).toStartWith('ip:')
    expect(ip).not.toContain('203.0.113.7')
    expect(ip).not.toBe(emailThrottleKey('203.0.113.7'))
  })
})
