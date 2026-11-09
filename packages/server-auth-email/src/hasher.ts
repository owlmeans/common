import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'
import type { ScryptOptions } from 'node:crypto'
import {
  SCRYPT_BLOCK_SIZE, SCRYPT_COST, SCRYPT_KEY_LENGTH, SCRYPT_MAX_COST, SCRYPT_MAX_MEMORY, SCRYPT_PARALLELISM,
  SCRYPT_PREFIX, SCRYPT_SALT_LENGTH,
} from './consts.local.js'
import type { PasswordHasher } from './hasher/types.js'

export const createPasswordHasher = (): PasswordHasher => {
  const derive = async (password: string, salt: Buffer, length: number, options: ScryptOptions): Promise<Buffer> =>
    await new Promise<Buffer>((resolve, reject) => {
      scrypt(password, salt, length, options, (error, key) => error != null ? reject(error) : resolve(key))
    })

  /** A positive integer from a stored part, or `null`. */
  const integerOf = (value: string | undefined): number | null =>
    value != null && /^[1-9][0-9]{0,9}$/.test(value) ? Number(value) : null

  const bytesOf = (value: string | undefined): Buffer | null =>
    value != null && /^[A-Za-z0-9_-]+$/.test(value) ? Buffer.from(value, 'base64url') : null

  const hash: PasswordHasher['hash'] = async password => {
    const salt = randomBytes(SCRYPT_SALT_LENGTH)
    const key = await derive(password, salt, SCRYPT_KEY_LENGTH, {
      N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELISM, maxmem: SCRYPT_MAX_MEMORY,
    })

    return [
      SCRYPT_PREFIX, SCRYPT_COST, SCRYPT_BLOCK_SIZE, SCRYPT_PARALLELISM, salt.toString('base64url'),
      key.toString('base64url'),
    ].join('$')
  }

  const verify: PasswordHasher['verify'] = async (password, stored) => {
    const parts = typeof stored === 'string' ? stored.split('$') : []
    if (parts.length !== 6 || parts[0] !== SCRYPT_PREFIX) {
      return false
    }
    const [N, r, p] = [integerOf(parts[1]), integerOf(parts[2]), integerOf(parts[3])]
    const salt = bytesOf(parts[4])
    const expected = bytesOf(parts[5])
    if (N == null || r == null || p == null || salt == null || expected == null) {
      return false
    }
    // A power of two the memory bound admits; anything else is not a hash this helper made.
    if (N < 2 || N > SCRYPT_MAX_COST || (N & (N - 1)) !== 0 || p > 16 || 128 * N * r > SCRYPT_MAX_MEMORY
      || salt.length < 8 || expected.length < 16 || expected.length > 64) {
      return false
    }

    let actual: Buffer
    try {
      actual = await derive(password, salt, expected.length, { N, r, p, maxmem: SCRYPT_MAX_MEMORY })
    } catch {
      return false
    }

    return timingSafeEqual(actual, expected)
  }

  return { hash, verify }
}

export const passwordHasher = createPasswordHasher()
