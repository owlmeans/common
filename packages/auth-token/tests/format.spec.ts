import { describe, expect, test } from 'bun:test'
import { tokenFormatHelper } from '../src/format.js'
import { AUTH_TOKEN_DEFAULT_PREFIX } from '../src/consts.js'

describe('@owlmeans/auth-token — Authorization parsing', () => {
  test('lower-cases the scheme so Bearer and BEARER are one answer', () => {
    expect(tokenFormatHelper.parseAuthorizationHeader('Bearer owl_abc')).toEqual({ scheme: 'bearer', value: 'owl_abc' })
    expect(tokenFormatHelper.parseAuthorizationHeader('BEARER owl_abc')?.scheme).toBe('bearer')
    expect(tokenFormatHelper.parseAuthorizationHeader('AUTH-TOKEN owl_abc')?.scheme).toBe('auth-token')
  })

  test('takes the first header when a proxy folded several', () => {
    expect(tokenFormatHelper.parseAuthorizationHeader(['Bearer one', 'Bearer two'])?.value).toBe('one')
  })

  test('answers null for anything that is not a scheme and a value', () => {
    expect(tokenFormatHelper.parseAuthorizationHeader(undefined)).toBeNull()
    expect(tokenFormatHelper.parseAuthorizationHeader('')).toBeNull()
    expect(tokenFormatHelper.parseAuthorizationHeader('Bearer')).toBeNull()
    expect(tokenFormatHelper.parseAuthorizationHeader('Bearer   ')).toBeNull()
    expect(tokenFormatHelper.parseAuthorizationHeader(' leadingspace')).toBeNull()
  })

  test('keeps a value that itself contains spaces', () => {
    expect(tokenFormatHelper.parseAuthorizationHeader('Bearer a b c')?.value).toBe('a b c')
  })
})

describe('@owlmeans/auth-token — token shape', () => {
  test('claims only a value carrying the prefix', () => {
    expect(tokenFormatHelper.isAccessToken('owl_abcdef', AUTH_TOKEN_DEFAULT_PREFIX)).toBe(true)
    expect(tokenFormatHelper.isAccessToken('vib_abcdef', AUTH_TOKEN_DEFAULT_PREFIX)).toBe(false)
    expect(tokenFormatHelper.isAccessToken('abcdef', AUTH_TOKEN_DEFAULT_PREFIX)).toBe(false)
    // The prefix alone is not a token — there is no secret behind it.
    expect(tokenFormatHelper.isAccessToken(AUTH_TOKEN_DEFAULT_PREFIX, AUTH_TOKEN_DEFAULT_PREFIX)).toBe(false)
    expect(tokenFormatHelper.isAccessToken(null, AUTH_TOKEN_DEFAULT_PREFIX)).toBe(false)
  })

  test('the display form keeps the prefix and eight characters of the secret', () => {
    const display = tokenFormatHelper.displayOf('owl_ABCDEFGHIJKLMNOP', 'owl_')
    expect(display).toBe('owl_ABCDEFGH')
    // Short enough to be useless, long enough to tell two of a person's tokens apart.
    expect(display.length).toBeLessThan('owl_ABCDEFGHIJKLMNOP'.length)
  })
})
