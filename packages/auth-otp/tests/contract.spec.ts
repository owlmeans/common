import { describe, expect, expectTypeOf, test } from 'bun:test'
import * as otp from '../src/index.js'
import type { OtpService } from '../src/index.js'

/**
 * This package is the contract between the OTP server (`@owlmeans/server-auth-otp`) and the clients
 * that select it: a value changed here changes what both sides agree on, so each one is pinned.
 */
describe('@owlmeans/auth-otp — the shared contract', () => {
  test('names the service, the auth type and the code store', () => {
    expect(otp.OTP_SERVICE).toBe('auth-otp-service')
    expect(otp.OTP_AUTH_TYPE).toBe('email-otp')
    expect(otp.OTP_RESOURCE).toBe('auth-otp-cache')
  })

  test('a code is six digits, lives ten minutes and survives four wrong guesses', () => {
    expect(otp.OTP_CODE_LENGTH).toBe(6)
    expect(otp.OTP_TTL_SECONDS).toBe(600)
    expect(otp.OTP_MAX_FAILED_ATTEMPTS).toBe(5)
  })

  test('the barrel exports constants only — no runtime code to drift', () => {
    expect(Object.keys(otp).sort()).toEqual([
      'OTP_AUTH_TYPE', 'OTP_CODE_LENGTH', 'OTP_MAX_FAILED_ATTEMPTS', 'OTP_RESOURCE', 'OTP_SERVICE', 'OTP_TTL_SECONDS',
    ])
    expect(Object.values(otp).every(value => typeof value === 'string' || typeof value === 'number')).toBe(true)
  })

  test('the service issues an opaque id and verifies by email, id and code', () => {
    expectTypeOf<OtpService['issueChallenge']>().parameters.toEqualTypeOf<[string]>()
    expectTypeOf<OtpService['issueChallenge']>().returns.toEqualTypeOf<Promise<string>>()
    expectTypeOf<OtpService['verifyChallenge']>().parameters.toEqualTypeOf<[string, string, string]>()
    expectTypeOf<OtpService['verifyChallenge']>().returns.toEqualTypeOf<Promise<void>>()
  })
})
