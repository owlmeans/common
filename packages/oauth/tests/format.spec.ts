import { describe, expect, test } from 'bun:test'
import { oauthFormatHelper } from '../src/format.js'
import { OAUTH_USER_CODE_ALPHABET } from '../src/consts.js'

describe('device and user codes', () => {
  test('device codes are unique and hash deterministically', () => {
    const a = oauthFormatHelper.createDeviceCode()
    const b = oauthFormatHelper.createDeviceCode()
    expect(a).not.toBe(b)
    expect(oauthFormatHelper.hashDeviceCode(a)).toBe(oauthFormatHelper.hashDeviceCode(a))
    expect(oauthFormatHelper.hashDeviceCode(a)).not.toBe(oauthFormatHelper.hashDeviceCode(b))
  })

  test('user codes are XXXX-XXXX from the RFC 8628 alphabet', () => {
    const code = oauthFormatHelper.createUserCode()
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    const letters = code.replace('-', '').split('')
    letters.forEach(letter => expect(OAUTH_USER_CODE_ALPHABET).toContain(letter))
  })

  test('normalizeUserCode tolerates case and missing dash', () => {
    const code = oauthFormatHelper.createUserCode()
    expect(oauthFormatHelper.normalizeUserCode(code.toLowerCase())).toBe(code)
    expect(oauthFormatHelper.normalizeUserCode(code.replace('-', ''))).toBe(code)
    expect(oauthFormatHelper.normalizeUserCode(` ${code} `)).toBe(code)
  })
})

describe('redirect URI matching', () => {
  test('non-loopback URIs must match exactly', () => {
    expect(oauthFormatHelper.matchesRedirectUri('https://app.example.com/cb', 'https://app.example.com/cb')).toBe(true)
    expect(oauthFormatHelper.matchesRedirectUri('https://app.example.com/cb', 'https://app.example.com/cb2')).toBe(false)
    expect(oauthFormatHelper.matchesRedirectUri('https://app.example.com/cb', 'http://127.0.0.1:3000/cb')).toBe(false)
  })

  test('loopback URIs match on any port', () => {
    expect(oauthFormatHelper.matchesRedirectUri('http://localhost/callback', 'http://localhost:53219/callback')).toBe(true)
    expect(oauthFormatHelper.matchesRedirectUri('http://127.0.0.1/callback', 'http://127.0.0.1:9999/callback')).toBe(true)
    expect(oauthFormatHelper.matchesRedirectUri('http://localhost/callback', 'http://localhost/other')).toBe(false)
  })

  test('a malformed URI never throws and never matches', () => {
    expect(oauthFormatHelper.matchesRedirectUri('not a url', 'http://localhost/cb')).toBe(false)
  })
})

describe('hostOf / isLoopbackHost', () => {
  test('extracts a hostname, or null for garbage', () => {
    expect(oauthFormatHelper.hostOf('https://example.com/path')).toBe('example.com')
    expect(oauthFormatHelper.hostOf('not a url')).toBeNull()
  })

  test('recognizes the loopback hosts', () => {
    expect(oauthFormatHelper.isLoopbackHost('localhost')).toBe(true)
    expect(oauthFormatHelper.isLoopbackHost('127.0.0.1')).toBe(true)
    expect(oauthFormatHelper.isLoopbackHost('example.com')).toBe(false)
    expect(oauthFormatHelper.isLoopbackHost(null)).toBe(false)
  })
})
