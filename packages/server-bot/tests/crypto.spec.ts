import { describe, expect, test } from 'bun:test'
import { botCryptoHelper } from '../src/helpers/crypto.js'
import { BotCredentialsUnreadable } from '../src/errors.js'

describe('@owlmeans/server-bot — credentials sealing', () => {
  const sealer = botCryptoHelper.sealerOf('a-deployment-secret')
  const credentials = { token: '123456:ABC-secret', userToken: 'xoxp-1' }

  test('round-trips under the same secret and scope, with a fresh IV each time', () => {
    const sealed = sealer.seal(credentials, 'org-1')
    const again = sealer.seal(credentials, 'org-1')

    expect(sealed.startsWith('v1.')).toBe(true)
    expect(sealed).not.toContain('123456')
    expect(sealed).not.toBe(again)
    expect(sealer.open(sealed, 'org-1')).toEqual(credentials)
    expect(botCryptoHelper.sealerOf('a-deployment-secret').open(again, 'org-1')).toEqual(credentials)
  })

  test('refuses a tampered ciphertext or tag, another secret and another scope', () => {
    const sealed = sealer.seal(credentials, 'org-1')
    const [version, iv, tag, body] = sealed.split('.')
    /** One bit flipped in the decoded bytes — a base64url character alone may differ only in padding bits. */
    const flip = (part: string): string => {
      const bytes = Buffer.from(part, 'base64url')
      bytes[0] ^= 0x01
      return bytes.toString('base64url')
    }

    expect(() => sealer.open([version, iv, tag, flip(body)].join('.'), 'org-1')).toThrow(BotCredentialsUnreadable)
    expect(() => sealer.open([version, iv, flip(tag), body].join('.'), 'org-1')).toThrow(BotCredentialsUnreadable)
    expect(() => sealer.open([version, flip(iv), tag, body].join('.'), 'org-1')).toThrow(BotCredentialsUnreadable)
    expect(() => botCryptoHelper.sealerOf('another-secret').open(sealed, 'org-1')).toThrow(BotCredentialsUnreadable)
    expect(() => sealer.open(sealed, 'org-2')).toThrow(BotCredentialsUnreadable)
    expect(() => sealer.open('plain-text', 'org-1')).toThrow(BotCredentialsUnreadable)
  })

  test('a hook secret is URL-safe and fits Telegram\'s secret_token alphabet', () => {
    const secret = botCryptoHelper.randomSecret()

    expect(secret).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(botCryptoHelper.randomSecret()).not.toBe(secret)
  })
})
