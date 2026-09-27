import { describe, expect, test } from 'bun:test'
import {
  createDeviceCode, createUserCode, hashDeviceCode, hostOf, isLoopbackHost, matchesRedirectUri,
  normalizeUserCode
} from '../src/format.js'
import { OAUTH_USER_CODE_ALPHABET } from '../src/consts.js'

describe('device and user codes', () => {
  test('device codes are unique and hash deterministically', () => {
    const a = createDeviceCode()
    const b = createDeviceCode()
    expect(a).not.toBe(b)
    expect(hashDeviceCode(a)).toBe(hashDeviceCode(a))
    expect(hashDeviceCode(a)).not.toBe(hashDeviceCode(b))
  })

  test('user codes are XXXX-XXXX from the RFC 8628 alphabet', () => {
    const code = createUserCode()
    expect(code).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/)
    const letters = code.replace('-', '').split('')
    letters.forEach(letter => expect(OAUTH_USER_CODE_ALPHABET).toContain(letter))
  })

  test('normalizeUserCode tolerates case and missing dash', () => {
    const code = createUserCode()
    expect(normalizeUserCode(code.toLowerCase())).toBe(code)
    expect(normalizeUserCode(code.replace('-', ''))).toBe(code)
    expect(normalizeUserCode(` ${code} `)).toBe(code)
  })
})

describe('redirect URI matching', () => {
  test('non-loopback URIs must match exactly', () => {
    expect(matchesRedirectUri('https://app.example.com/cb', 'https://app.example.com/cb')).toBe(true)
    expect(matchesRedirectUri('https://app.example.com/cb', 'https://app.example.com/cb2')).toBe(false)
    expect(matchesRedirectUri('https://app.example.com/cb', 'http://127.0.0.1:3000/cb')).toBe(false)
  })

  test('loopback URIs match on any port', () => {
    expect(matchesRedirectUri('http://localhost/callback', 'http://localhost:53219/callback')).toBe(true)
    expect(matchesRedirectUri('http://127.0.0.1/callback', 'http://127.0.0.1:9999/callback')).toBe(true)
    expect(matchesRedirectUri('http://localhost/callback', 'http://localhost/other')).toBe(false)
  })

  test('a malformed URI never throws and never matches', () => {
    expect(matchesRedirectUri('not a url', 'http://localhost/cb')).toBe(false)
  })
})

describe('hostOf / isLoopbackHost', () => {
  test('extracts a hostname, or null for garbage', () => {
    expect(hostOf('https://example.com/path')).toBe('example.com')
    expect(hostOf('not a url')).toBeNull()
  })

  test('recognizes the loopback hosts', () => {
    expect(isLoopbackHost('localhost')).toBe(true)
    expect(isLoopbackHost('127.0.0.1')).toBe(true)
    expect(isLoopbackHost('example.com')).toBe(false)
    expect(isLoopbackHost(null)).toBe(false)
  })
})
