import { describe, expect, test } from 'bun:test'
import { ssrfHelper } from '../src/ssrf.js'

describe('isPrivateAddress', () => {
  test('refuses loopback, private and link-local IPv4 ranges', () => {
    expect(ssrfHelper.isPrivateAddress('127.0.0.1')).toBe(true)
    expect(ssrfHelper.isPrivateAddress('10.1.2.3')).toBe(true)
    expect(ssrfHelper.isPrivateAddress('172.16.0.1')).toBe(true)
    expect(ssrfHelper.isPrivateAddress('172.31.255.255')).toBe(true)
    expect(ssrfHelper.isPrivateAddress('192.168.1.1')).toBe(true)
    expect(ssrfHelper.isPrivateAddress('169.254.1.1')).toBe(true)
    expect(ssrfHelper.isPrivateAddress('0.0.0.0')).toBe(true)
  })

  test('admits ordinary public IPv4 addresses', () => {
    expect(ssrfHelper.isPrivateAddress('8.8.8.8')).toBe(false)
    expect(ssrfHelper.isPrivateAddress('172.32.0.1')).toBe(false) // just outside 172.16/12
    expect(ssrfHelper.isPrivateAddress('1.1.1.1')).toBe(false)
  })

  test('refuses IPv6 loopback, unique-local and link-local', () => {
    expect(ssrfHelper.isPrivateAddress('::1')).toBe(true)
    expect(ssrfHelper.isPrivateAddress('fe80::1')).toBe(true)
    expect(ssrfHelper.isPrivateAddress('fc00::1')).toBe(true)
    expect(ssrfHelper.isPrivateAddress('fd12:3456::1')).toBe(true)
  })

  test('unwraps an IPv4-mapped IPv6 address before judging it', () => {
    expect(ssrfHelper.isPrivateAddress('::ffff:127.0.0.1')).toBe(true)
    expect(ssrfHelper.isPrivateAddress('::ffff:8.8.8.8')).toBe(false)
  })

  test('refuses anything it cannot parse as an address', () => {
    expect(ssrfHelper.isPrivateAddress('not-an-ip')).toBe(true)
  })
})

describe('assertPublicHostname', () => {
  test('accepts a hostname that resolves publicly', async () => {
    await expect(ssrfHelper.assertPublicHostname('8.8.8.8')).resolves.toBeUndefined()
  })

  test('refuses a private literal without any DNS lookup', async () => {
    await expect(ssrfHelper.assertPublicHostname('127.0.0.1')).rejects.toThrow()
    await expect(ssrfHelper.assertPublicHostname('localhost')).rejects.toThrow()
  })
})
