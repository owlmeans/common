import { describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { emailAuthKeyHelper } from '../src/keys.js'

describe('@owlmeans/server-auth-email — keys', () => {
  test('throttle keys are purpose-bound digests: case-insensitive, never the raw address or IP', () => {
    const { throttleKey } = emailAuthKeyHelper

    const key = throttleKey('pinEmail', 'Person@Example.org ')
    expect(key).toMatch(/^auth-email:pinEmail:[0-9a-f]{64}$/)
    expect(key).not.toContain('person')
    expect(key).toBe(throttleKey('pinEmail', 'person@example.org'))
    expect(throttleKey('passwordEmail', 'person@example.org')).not.toBe(key.replace('pinEmail', 'passwordEmail'))
    expect(throttleKey('pinIp', '203.0.113.7')).not.toContain('203.0.113.7')
  })

  test('a device is sha256("{accountId}:{device}"); a ticket is stored by digest', () => {
    const { deviceKey, ticketKey } = emailAuthKeyHelper

    expect(deviceKey('account-1', 'device-id')).toBe(createHash('sha256').update('account-1:device-id').digest('hex'))
    expect(deviceKey('account-2', 'device-id')).not.toBe(deviceKey('account-1', 'device-id'))
    expect(ticketKey('the-ticket')).toMatch(/^offer:[0-9a-f]{64}$/)
    expect(ticketKey('the-ticket')).not.toContain('the-ticket')
  })

  test('an address as a log carries it: the domain only', () => {
    expect(emailAuthKeyHelper.emailDomain('Person@Example.ORG')).toBe('example.org')
    expect(emailAuthKeyHelper.emailDomain('no-at-sign')).toBe('')
    expect(emailAuthKeyHelper.normalizeEmail('  Person@Example.org ')).toBe('person@example.org')
  })
})
