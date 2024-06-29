import { KeyType } from '../consts.js'
import type { KeyPlugin } from './types.js'
import { ed25519 } from '@noble/curves/ed25519'

export const ed25519Plugin: KeyPlugin = {
  type: KeyType.ED25519,

  random: () => ed25519.utils.randomPrivateKey(),

  sign: (data: Uint8Array, pk: Uint8Array) => ed25519.sign(data, pk),

  verify: (data: Uint8Array, signature: Uint8Array, pub: Uint8Array) => ed25519.verify(signature, data, pub),

  toPublic: (pk: Uint8Array) => ed25519.getPublicKey(pk),
}
