import { ed25519 } from '@noble/curves/ed25519'
import type { KeyPlugin } from '@owlmeans/basic-keys/plugins'
import { KEY_OWL } from '../consts.js'
import { base58, utf8 } from '@scure/base'
import { concatBytes, randomBytes } from '@noble/hashes/utils'
import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha512'
import { keccak_256 } from '@noble/hashes/sha3'

export const ed25519owlPluginBuilder = (type: string = KEY_OWL): KeyPlugin => {
  const key: KeyPlugin = {
    type: type,

    random: () =>  key.fromSeed!(randomBytes(32)),

    derive: (pk, path) => 
      hmac(sha512, pk.slice(32), concatBytes(pk.slice(0, 32), utf8.decode(path))),

    fromSeed: (seed: Uint8Array) => hmac(sha512, utf8.decode(type), seed),

    sign: (data, pk) => ed25519.sign(data, pk.slice(0, 32)),

    verify: (data, signature, pub) => ed25519.verify(signature, data, pub),

    toPublic: pk => ed25519.getPublicKey(pk.slice(0, 32)),

    toAdress: pub => base58.encode(keccak_256(pub.slice(4)).slice(-20))
  }

  return key
}
