import { describe, expect, test } from 'bun:test'
import Ajv from 'ajv'
import { SaveMarketingConsentSchema } from '../src/schemas.js'

const validate = new Ajv().compile(SaveMarketingConsentSchema)

const request = (source: string) => ({ decisions: [{ key: 'marketing.email', granted: true }], source })

describe('SaveMarketingConsentSchema', () => {
  test('accepts the two sources a person can decide from', () => {
    expect(validate(request('sign-in'))).toBe(true)
    expect(validate(request('settings'))).toBe(true)
  })

  test('refuses a decision claiming a cookie origin — nothing seeds an account from a device any more', () => {
    expect(validate(request('cookie'))).toBe(false)
    expect(validate(request('api'))).toBe(false)
  })
})
