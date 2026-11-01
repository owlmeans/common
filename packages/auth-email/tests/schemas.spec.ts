import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import formatsPlugin from 'ajv-formats'
import {
  EmailEmptyRequestSchema, EmailPasswordPinRequestSchema, EmailPasswordRemoveRequestSchema,
  EmailPasswordSetRequestSchema, EmailPinRequestSchema, EmailSignInRequestSchema, EmailTechPinRequestSchema,
  EmailPasswordPurpose,
} from '@owlmeans/auth-email'

const ajv = new Ajv()
formatsPlugin(ajv)

const pinRequest = ajv.compile(EmailPinRequestSchema)
const signIn = ajv.compile(EmailSignInRequestSchema)
const passwordPin = ajv.compile(EmailPasswordPinRequestSchema)
const passwordSet = ajv.compile(EmailPasswordSetRequestSchema)
const passwordRemove = ajv.compile(EmailPasswordRemoveRequestSchema)
const techPin = ajv.compile(EmailTechPinRequestSchema)
const empty = ajv.compile(EmailEmptyRequestSchema)

/** 22 base64url characters — 16 random bytes, the way the browser makes a device id. */
const DEVICE = 'AbCdEfGhIjKlMnOpQrSt_-'

describe('@owlmeans/auth-email — EmailPinRequestSchema', () => {
  test('accepts an address with an optional locale and captcha token', () => {
    expect(pinRequest({ email: 'person@example.com' })).toBe(true)
    expect(pinRequest({ email: 'person@example.com', locale: 'pl', captcha: 'token' })).toBe(true)
  })

  test('refuses a malformed or overlong address', () => {
    expect(pinRequest({ email: 'not-an-address' })).toBe(false)
    expect(pinRequest({ email: `${'a'.repeat(250)}@example.com` })).toBe(false)
    expect(pinRequest({})).toBe(false)
  })

  test('refuses fields it does not declare, an organization above all', () => {
    expect(pinRequest({ email: 'person@example.com', entitySlug: 'acme' })).toBe(false)
    expect(pinRequest({ email: 'person@example.com', source: 'web' })).toBe(false)
  })
})

describe('@owlmeans/auth-email — EmailSignInRequestSchema', () => {
  test('accepts the PIN mode and the password mode in one schema', () => {
    expect(signIn({ email: 'person@example.com', device: DEVICE, challenge: 'signed', pin: '012345' })).toBe(true)
    expect(signIn({ email: 'person@example.com', device: DEVICE, password: 'secret', captcha: 't', locale: 'de' })).toBe(true)
  })

  test('refuses a PIN that is not six digits', () => {
    for (const pin of ['12345', '1234567', 'abcdef', '12 345']) {
      expect(signIn({ email: 'person@example.com', device: DEVICE, challenge: 'signed', pin })).toBe(false)
    }
  })

  test('requires a well-formed device id', () => {
    expect(signIn({ email: 'person@example.com', challenge: 'signed', pin: '012345' })).toBe(false)
    expect(signIn({ email: 'person@example.com', device: 'short', password: 'secret' })).toBe(false)
    expect(signIn({ email: 'person@example.com', device: `${DEVICE}!`, password: 'secret' })).toBe(false)
  })

  test('refuses extra fields and an overlong password', () => {
    expect(signIn({ email: 'person@example.com', device: DEVICE, password: 'secret', remember: true })).toBe(false)
    expect(signIn({ email: 'person@example.com', device: DEVICE, password: 'x'.repeat(1025) })).toBe(false)
  })
})

describe('@owlmeans/auth-email — password route schemas', () => {
  test('a confirmation PIN names one of the three purposes', () => {
    for (const purpose of Object.values(EmailPasswordPurpose)) {
      expect(passwordPin({ purpose, locale: 'uk' })).toBe(true)
    }
    expect(passwordPin({ purpose: 'reset' })).toBe(false)
    expect(passwordPin({})).toBe(false)
  })

  test('set takes an offer or a challenge + PIN, and an optional device to keep remembered', () => {
    expect(passwordSet({ password: 'long-enough', offer: 'ticket' })).toBe(true)
    expect(passwordSet({ password: 'long-enough', challenge: 'signed', pin: '123456', device: DEVICE })).toBe(true)
    expect(passwordSet({ password: 'long-enough', offer: 'ticket', device: 'bad device' })).toBe(false)
    expect(passwordSet({ offer: 'ticket' })).toBe(false)
  })

  test('remove needs a challenge + PIN and takes an optional device', () => {
    expect(passwordRemove({ challenge: 'signed', pin: '123456' })).toBe(true)
    expect(passwordRemove({ challenge: 'signed', pin: '123456', device: DEVICE })).toBe(true)
    expect(passwordRemove({ challenge: 'signed', pin: '123456', device: 'x' })).toBe(false)
    expect(passwordRemove({ challenge: 'signed' })).toBe(false)
  })

  test('decline and the waiver take an empty body; tech/pin a challenge + PIN', () => {
    expect(empty({})).toBe(true)
    expect(empty({ entitySlug: 'acme' })).toBe(false)
    expect(techPin({ challenge: 'signed', pin: '123456' })).toBe(true)
    expect(techPin({ challenge: 'signed', pin: '12345' })).toBe(false)
  })
})
