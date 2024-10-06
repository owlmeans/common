import { KeyType } from '../consts.js'
import type { KeyPlugin } from './types.js'
import { ed25519 } from '@noble/curves/ed25519'
import { base58 } from '@scure/base'
import { keccak_256 } from '@noble/hashes/sha3'

export const ed25519Plugin: KeyPlugin = {
  type: KeyType.ED25519,

  random: () => ed25519.utils.randomPrivateKey(),

  sign: (data, pk) => ed25519.sign(data, pk),

  verify: (data, signature, pub) => ed25519.verify(signature, data, pub),

  toPublic: pk => ed25519.getPublicKey(pk),

  toAdress: pub => base58.encode(keccak_256(pub.slice(4)).slice(-20))
}
