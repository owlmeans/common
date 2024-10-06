import { keccak_256 } from '@noble/hashes/sha3'
import { base64, utf8 } from '@scure/base'
import { plugins } from './plugins/index.js'
import canonicalize from 'canonicalize'

export const toAddress = (publicKey: Uint8Array): Uint8Array =>
  keccak_256(publicKey.slice(4)).slice(-20)

export const prepareKey = (key: string): Uint8Array =>
  base64.decode(key)

export const prepareData = (data: unknown): Uint8Array => {
  if (typeof data === 'object') {
    if (!(data instanceof Uint8Array)) {
      data = canonicalize(data)
    }
  }
  if (typeof data === 'string') {
    data = utf8.decode(data)
  } else if (!(data instanceof Uint8Array)) {
    throw new Error('basic.keys:sign-data-type')
  }

  if (!(data instanceof Uint8Array)) {
    console.log('Impossible scenario of data preparation', data)
    throw new Error('basic.keys:sign-data-type')
  }

  return data
}

export const assertType = (type?: string): void => {
  if (type == null || !(type in plugins)) {
    throw new Error('basic.keys:unknown-type')
  }
}
