import { describe, expect, test } from 'bun:test'
import { ResilientError } from '@owlmeans/error'
import * as email from '@owlmeans/auth-email'
import {
  EmailAuthError, EmailAuthUnavailable, EmailOfferExpired, EmailPasswordDisabled, EmailPasswordWeak,
  EmailTechDisabled,
} from '@owlmeans/auth-email'

/** Server, browser and stored records agree on these values; a change here breaks one of them. */
describe('@owlmeans/auth-email — constants', () => {
  test('names the methods, token types, envelopes, header and captcha actions', () => {
    expect(email.EMAIL_LOGIN_METHOD).toBe('email')
    expect(email.EMAIL_PIN_AUTH_TYPE).toBe('email-pin')
    expect(email.EMAIL_PASSWORD_AUTH_TYPE).toBe('email-password')
    expect(email.EMAIL_CONFIRM_ENVELOPE).toBe('email-confirm')
    expect(email.EMAIL_WAIVER_ENVELOPE).toBe('email-waiver')
    expect(email.EMAIL_WAIVER_HEADER).toBe('x-owlmeans-email-waiver')
    expect(email.EMAIL_CAPTCHA_ACTION_PIN).toBe('email_pin')
    expect(email.EMAIL_CAPTCHA_ACTION_PASSWORD).toBe('email_password')
    expect(email.EMAIL_CAPTCHA_PROVIDER).toBe('recaptcha-v3')
    expect(email.EMAIL_IDENTITY_TYPE).toBe('email-otp')
  })

  test('pins the policy numbers and patterns', () => {
    expect(email.EMAIL_PIN_LENGTH).toBe(6)
    expect(email.EMAIL_PIN_PATTERN).toBe('^[0-9]{6}$')
    expect(email.EMAIL_DEVICE_TTL_DAYS).toBe(30)
    expect(email.EMAIL_DEVICE_LIMIT).toBe(10)
    expect(email.EMAIL_DEVICE_ID_PATTERN).toBe('^[A-Za-z0-9_-]{22,64}$')
    expect(email.EMAIL_OFFER_TTL_SECONDS).toBe(900)
    expect(email.EMAIL_WAIVER_TTL_SECONDS).toBe(7200)
    expect([email.EMAIL_PASSWORD_MIN_LENGTH, email.EMAIL_PASSWORD_MAX_LENGTH]).toEqual([8, 128])
    expect([...email.EMAIL_AUTH_LOCALES]).toEqual(['en', 'pl', 'ru', 'be', 'uk', 'es', 'de', 'fr'])
    expect(Object.isFrozen(email.EMAIL_AUTH_LOCALES)).toBe(true)
  })

  test('pins the enums, service aliases and paths', () => {
    expect(Object.values(email.EmailPasswordPurpose) as string[]).toEqual(['set', 'change', 'remove'])
    expect(email.EmailSignInReason.Device as string).toBe('device')
    expect(email.EMAIL_AUTH_SERVICE).toBe('auth-email')
    expect(email.EMAIL_LOGIN_SERVICE).toBe('auth-email-client')
    expect(email.EMAIL_AUTH_TECH_GATE).toBe('auth-email:tech-gate')
    expect(email.EMAIL_AUTH_API_PATH).toBe('/auth/email')
    expect(email.EMAIL_AUTH_OFFER_PATH).toBe('/login/password')
  })
})

describe('@owlmeans/auth-email — errors', () => {
  test('each class survives a marshal round trip with its type and status', () => {
    const cases: Array<[ResilientError, Function, number]> = [
      [new EmailPasswordDisabled(), EmailPasswordDisabled, 404],
      [new EmailPasswordWeak('length'), EmailPasswordWeak, 422],
      [new EmailOfferExpired(), EmailOfferExpired, 409],
      [new EmailTechDisabled(), EmailTechDisabled, 404],
      [new EmailAuthUnavailable('mail'), EmailAuthUnavailable, 503],
    ]
    for (const [error, Class, status] of cases) {
      const restored = ResilientError.ensure(ResilientError.marshal(error))
      expect(restored).toBeInstanceOf(Class)
      expect(restored).toBeInstanceOf(EmailAuthError)
      expect(restored.message).toBe(error.message)
      expect((Class as unknown as { httpStatus: number }).httpStatus).toBe(status)
    }
    expect(new EmailPasswordWeak('length').message).toBe('auth-email:weak:length')
  })
})
