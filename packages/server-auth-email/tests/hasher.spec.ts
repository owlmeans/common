import { describe, expect, test } from 'bun:test'
import { EmailPasswordWeak } from '@owlmeans/auth-email'
import { createPasswordHasher, passwordHasher } from '../src/hasher.js'
import { createEmailPasswordPolicy } from '../src/policy.js'

describe('@owlmeans/server-auth-email — password hasher', () => {
  test('stores scrypt$32768$8$1$<16-byte salt>$<32-byte key>, a fresh salt each time', async () => {
    const first = await passwordHasher.hash('correct horse battery')
    const second = await passwordHasher.hash('correct horse battery')

    const [prefix, cost, block, parallel, salt, key] = first.split('$')
    expect([prefix, cost, block, parallel]).toEqual(['scrypt', '32768', '8', '1'])
    expect(Buffer.from(salt!, 'base64url')).toHaveLength(16)
    expect(Buffer.from(key!, 'base64url')).toHaveLength(32)
    expect(second).not.toBe(first)
  })

  test('verifies the right password only', async () => {
    const hasher = createPasswordHasher()
    const stored = await hasher.hash('correct horse battery')

    expect(await hasher.verify('correct horse battery', stored)).toBe(true)
    expect(await hasher.verify('correct horse batterY', stored)).toBe(false)
    expect(await hasher.verify('', stored)).toBe(false)
  })

  test('an unknown format or out-of-bounds parameters answer false, never throw', async () => {
    const stored = await passwordHasher.hash('pw-pw-pw-pw')
    const [, , , , salt, key] = stored.split('$')

    for (const value of [
      '', 'plain', 'bcrypt$2b$10$abc', stored.replace('scrypt$', 'argon$'), `${stored}$extra`,
      `scrypt$32769$8$1$${salt}$${key}`, `scrypt$4194304$8$1$${salt}$${key}`, `scrypt$32768$8$1$${salt}$!!`,
      `scrypt$32768$x$1$${salt}$${key}`, undefined as unknown as string,
    ]) {
      expect(await passwordHasher.verify('pw-pw-pw-pw', value)).toBe(false)
    }
  })
})

describe('@owlmeans/server-auth-email — password policy', () => {
  test('length bounds in characters, after NFKC; never the address itself', () => {
    const policy = createEmailPasswordPolicy(true)

    expect(policy.enabled()).toBe(true)
    expect(policy.assert('ｐａｓｓｗｏｒｄ１', 'a@example.org')).toBe('password1')
    expect(policy.assert('пароль-кот', 'a@example.org')).toBe('пароль-кот')
    for (const [password, reason] of [['seven77', 'length'], ['x'.repeat(129), 'length'], [' A@Example.org', 'email']] as const) {
      expect(() => policy.assert(password, 'a@example.org')).toThrow(EmailPasswordWeak)
      expect(() => policy.assert(password, 'a@example.org')).toThrow(`weak:${reason}`)
    }
  })

  test('off unless asked for; bounds can be narrowed', () => {
    expect(createEmailPasswordPolicy(undefined).enabled()).toBe(false)
    expect(createEmailPasswordPolicy(false).enabled()).toBe(false)

    const strict = createEmailPasswordPolicy({ minLength: 12, maxLength: 16 })
    expect(strict.enabled()).toBe(true)
    expect(() => strict.assert('eleven-char', 'a@example.org')).toThrow(EmailPasswordWeak)
    expect(strict.assert('twelve-chars', 'a@example.org')).toBe('twelve-chars')
    expect(() => strict.assert('seventeen-chars!!', 'a@example.org')).toThrow(EmailPasswordWeak)
  })
})
