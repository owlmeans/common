import { describe, expect, test } from 'bun:test'
import { AuthenFailed, AuthUnavailable } from '@owlmeans/auth'
import { ApiClientError, ApiStatusError, ServerAuthError } from '@owlmeans/api'
import { ResilientError } from '@owlmeans/error'
import { EmailOfferExpired, EmailPasswordDisabled, EmailPasswordWeak } from '@owlmeans/auth-email'
import { CaptchaLoadError } from '@owlmeans/web-captcha'
import { emailRefusalHelper as helper } from '../src/refusal.js'
import type { Translate } from '../src/types.js'

const english: Translate = (_key, defaultValue) => defaultValue

/** What the API client rejects with for a production answer: the status alone. */
const status = (code: number) => Object.assign(code === 401 ? new ServerAuthError() : code === 403 ? new ApiClientError('forbidden') : new ApiStatusError(code), {
  responseStatus: code,
})

/** What it rejects with for a development answer: the typed error, rebuilt from its wire form. */
const wire = (error: Error) => ResilientError.ensure(ResilientError.marshal(error).message, true)

describe('emailRefusalHelper — typed refusals (development bodies)', () => {
  test('wrong password, wrong code, captcha and its outage', () => {
    expect(helper.refusalOf(wire(new AuthenFailed('email:password')), 'password').kind).toBe('credentials')
    expect(helper.refusalOf(wire(new AuthenFailed('otp:code')), 'pin').kind).toBe('code')
    expect(helper.refusalOf(wire(new AuthenFailed('recaptcha:score')), 'send').kind).toBe('captcha')
    expect(helper.refusalOf(wire(new AuthUnavailable('recaptcha:config')), 'send').kind).toBe('captcha-unavailable')
    expect(helper.refusalOf(new CaptchaLoadError('timeout'), 'send').kind).toBe('captcha-unavailable')
  })

  test('the e-mail family: weak, expired offer, passwords off', () => {
    expect(helper.refusalOf(wire(new EmailPasswordWeak()), 'set').kind).toBe('weak')
    expect(helper.refusalOf(wire(new EmailOfferExpired()), 'offer').kind).toBe('offer-expired')
    expect(helper.refusalOf(wire(new EmailPasswordDisabled()), 'password').kind).toBe('password-disabled')
  })

  test('a throttle names its wait only when one is known', () => {
    const throttled = Object.assign(new ResilientError('OtpErrorThrottled', 'otp:throttled'), { retryAfter: 45 })
    expect(helper.refusalOf(throttled, 'send')).toEqual({ kind: 'throttled', retryAfter: 45 })
    // Rebuilt from the wire the number is lost (1) — no time is claimed then.
    expect(helper.refusalOf(Object.assign(status(429), { retryAfter: 1 }), 'send')).toEqual({ kind: 'throttled' })
  })
})

describe('emailRefusalHelper — status-only refusals (production bodies)', () => {
  test('a 401 is a wrong code after a PIN and wrong credentials after a password', () => {
    expect(helper.refusalOf(status(401), 'pin').kind).toBe('code')
    expect(helper.refusalOf(status(401), 'password').kind).toBe('credentials')
    expect(helper.refusalOf(status(401), 'send').kind).toBe('failed')
  })

  test('a 403 is the captcha on a guest route and the confirmation PIN on a signed-in one', () => {
    expect(helper.refusalOf(status(403), 'send').kind).toBe('captcha')
    expect(helper.refusalOf(status(403), 'password').kind).toBe('captcha')
    expect(helper.refusalOf(status(403), 'confirm').kind).toBe('code')
    expect(helper.refusalOf(status(403), 'set').kind).toBe('code')
    expect(helper.refusalOf(status(403), 'remove').kind).toBe('code')
  })

  test('the server\'s own refusal classes, unknown here, still read by their message', () => {
    const credential = new ResilientError('EmailCredentialRefused', 'auth:manager:authen:email:password')
    const confirmation = new ResilientError('EmailVerificationRefused', 'auth:manager:authen:email:confirm:purpose')
    expect(helper.refusalOf(Object.assign(credential, { responseStatus: 401 }), 'password').kind).toBe('credentials')
    expect(helper.refusalOf(Object.assign(confirmation, { responseStatus: 403 }), 'remove').kind).toBe('code')
  })

  test('429, 422, 409, 503, 404, 400 and anything else', () => {
    expect(helper.refusalOf(status(429), 'pin').kind).toBe('throttled')
    expect(helper.refusalOf(status(422), 'set').kind).toBe('weak')
    expect(helper.refusalOf(status(409), 'offer').kind).toBe('offer-expired')
    expect(helper.refusalOf(status(503), 'send').kind).toBe('unavailable')
    expect(helper.refusalOf(status(404), 'password').kind).toBe('password-disabled')
    expect(helper.refusalOf(status(400), 'send').kind).toBe('email')
    expect(helper.refusalOf(status(500), 'pin').kind).toBe('failed')
    expect(helper.refusalOf(new Error('network'), 'pin').kind).toBe('failed')
  })
})

describe('emailRefusalHelper — messages', () => {
  test('a known wait is phrased by the language itself', () => {
    expect(helper.messageOf({ kind: 'throttled', retryAfter: 45 }, english, 'en'))
      .toBe('Too many attempts. Please try again in 45 seconds.')
    expect(helper.messageOf({ kind: 'throttled', retryAfter: 600 }, english, 'en'))
      .toBe('Too many attempts. Please try again in 10 minutes.')
    expect(helper.messageOf({ kind: 'throttled' }, english)).toBe('Too many attempts. Please wait a little and try again.')
  })

  test('the policy and the code length fill their placeholders, whatever the translator', () => {
    const raw: Translate = key => key === 'error.weak' ? 'Od {{min}} do {{max}}' : key
    expect(helper.messageOf({ kind: 'weak' }, raw)).toBe('Od 8 do 128')
    expect(helper.messageOf({ kind: 'pin-format' }, english)).toBe('Enter the code from the email: 6 digits.')
  })
})
