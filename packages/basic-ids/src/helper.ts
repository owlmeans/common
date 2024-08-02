
import { randomBytes } from '@noble/hashes/utils'
import { base58 } from '@scure/base'
import { IdStyle } from './consts.js'

export const createRandomPrefix = (length: number = 6, format: IdStyle = IdStyle.Base58): string => {
  const rand = randomBytes(length)
  switch (format) {
    case IdStyle.Base58:
    default:
      return base58.encode(rand)
  }
}

export const createIdOfLength = (length: number = 6, format: IdStyle = IdStyle.Base58): string => {
  return createRandomPrefix(length * 2, format).slice(0, length)
}
