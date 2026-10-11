import { describe, expect, test } from 'bun:test'
import { throttleKeyHelper } from '../src/throttle-keys.js'
import { otpKeyHelper } from '../src/keys.js'

describe('@owlmeans/server-auth-otp — privacy-preserving keys', () => {
  test('normalizes email case without storing the raw address', () => {
    const lower = throttleKeyHelper.emailThrottleKey('person@example.com')
    expect(throttleKeyHelper.emailThrottleKey(' PERSON@EXAMPLE.COM ')).toBe(lower)
    expect(lower).not.toContain('person')
    expect(otpKeyHelper.otpEmailKey('person@example.com')).not.toContain('person')
  })

  test('does not collapse punctuation the old lossy key strategy discarded', () => {
    expect(throttleKeyHelper.emailThrottleKey('a+b@example.com')).not.toBe(throttleKeyHelper.emailThrottleKey('a_b@example.com'))
  })

  test('namespaces IP and email digests independently and keeps the IP non-raw', () => {
    const ip = throttleKeyHelper.ipThrottleKey('203.0.113.7')
    expect(ip).toStartWith('ip:')
    expect(ip).not.toContain('203.0.113.7')
    expect(ip).not.toBe(throttleKeyHelper.emailThrottleKey('203.0.113.7'))
  })
})
