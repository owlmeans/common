import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto'
import { BOT_HKDF_INFO, BOT_HKDF_SALT, BOT_SEALED_VERSION } from '../consts.js'
import { BotCredentialsUnreadable } from '../errors.js'
import type { BotCryptoHelper, BotSealer } from './crypto/types.js'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

export const createBotCryptoHelper = (): BotCryptoHelper => {
  const sealers = new Map<string, BotSealer>()

  const makeSealer = (secret: string): BotSealer => {
    const key = Buffer.from(hkdfSync('sha256', secret, BOT_HKDF_SALT, BOT_HKDF_INFO, 32))

    const seal = (credentials: Record<string, string>, aad: string): string => {
      const iv = randomBytes(IV_BYTES)
      const cipher = createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES })
      cipher.setAAD(Buffer.from(aad, 'utf8'))
      const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()])

      return [BOT_SEALED_VERSION, iv, cipher.getAuthTag(), encrypted]
        .map(part => typeof part === 'string' ? part : part.toString('base64url')).join('.')
    }

    const open = (sealed: string, aad: string): Record<string, string> => {
      const [version, iv, tag, encrypted, ...rest] = `${sealed}`.split('.')
      if (version !== BOT_SEALED_VERSION || iv == null || tag == null || encrypted == null || rest.length > 0) {
        throw new BotCredentialsUnreadable('format')
      }
      let text: string
      try {
        const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'base64url'), { authTagLength: TAG_BYTES })
        decipher.setAAD(Buffer.from(aad, 'utf8'))
        decipher.setAuthTag(Buffer.from(tag, 'base64url'))
        text = Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8')
      } catch {
        throw new BotCredentialsUnreadable('authentication')
      }
      const parsed: unknown = JSON.parse(text)
      if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        throw new BotCredentialsUnreadable('shape')
      }

      return Object.fromEntries(Object.entries(parsed).filter(([, value]) => typeof value === 'string')) as Record<string, string>
    }

    return { seal, open }
  }

  const sealerOf = (secret: string): BotSealer => {
    let sealer = sealers.get(secret)
    if (sealer == null) {
      sealer = makeSealer(secret)
      sealers.set(secret, sealer)
    }

    return sealer
  }

  const randomSecret = (bytes: number = 32): string => randomBytes(bytes).toString('base64url')

  return { sealerOf, randomSecret }
}

export const botCryptoHelper = createBotCryptoHelper()
