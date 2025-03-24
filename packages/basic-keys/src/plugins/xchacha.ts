import { KeyType } from '../consts.js'
import type { KeyPlugin } from './types.js'
import { xchacha20poly1305 } from '@noble/ciphers/chacha'
import { randomBytes, managedNonce } from '@noble/ciphers/webcrypto'


export const xChahaPlugin: KeyPlugin = {
  type: KeyType.XCHACHA,

  random: () => randomBytes(32),

  sign: () => { throw new Error(`${xChahaPlugin.type}:signing`) },

  verify: () => { throw new Error(`${xChahaPlugin.type}:verification`) },

  toPublic: pk => pk,

  toAdress: () => 'no-address',

  encrypt: (data, pk) => managedNonce(xchacha20poly1305)(pk).encrypt(data),

  decrypt: (data, pk) => managedNonce(xchacha20poly1305)(pk).decrypt(data),
}
